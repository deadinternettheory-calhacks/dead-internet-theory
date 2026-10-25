// Inference worker. Each investigation.ready event becomes one job that moves
// through persisted stages, each run by a separately scheduled action:
//   triage_start -> [triage_wait] -> enrich_start -> enrich_wait
//   -> scoring_start -> scoring_wait -> done | failed
// Histories are requested for a seeded random sample of supportive and
// unsupportive users after triage; triage is one direct Claude call when
// ANTHROPIC_API_KEY is set (otherwise a CREAO run); validated model replies are
// cached by their exact input; CREAO can wake the job by webhook instead of
// waiting for the next poll.
// All reads and writes go to the ingestion backend's v1 API with stable
// idempotency keys (backend/INTEGRATION.md).
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { BackendError, createBackendClient, type BackendClient } from './lib/backendClient';
import type { EnrichmentJob, GraphEnvelope, InvestigationReadyEvent } from './lib/contract';
import { recordedResponsesFor } from './lib/fixtures';
import { assembleAnalysis } from './lib/inference/assemble';
import { ClaudeError, claudeTriage, DEFAULT_CLAUDE_MODEL, type ClaudeConfig } from './lib/inference/claude';
import { createCreaoClient, CreaoError, MockCreaoClient, type CreaoClient } from './lib/inference/creao';
import { checkSubmission } from './lib/inference/evidence';
import { ModelOutputError, parseScoring, parseTriage, type ScoringOutput, type TriageOutput } from './lib/inference/outputs';
import { enrichmentRequestFor, MAX_STAGE_ATTEMPTS, needsScoring, scoringInputs, triageInputs } from './lib/inference/pipeline';
import { PROMPT_VERSION } from './lib/inference/prompts';
import { validateModel } from './lib/schema';
import { sha256Hex } from './lib/util';

const STAGE_DEADLINE_MS = 15 * 60_000;
const ENRICHMENT_POLL_MS = 3_000;
const ENRICHMENT_DEADLINE_MS = 5 * 60_000;
const RETRY_MS = 10_000;
/** Longer than any single step (Convex actions stop at 10 minutes). */
const LEASE_MS = 11 * 60_000;
const CACHE_TTL_MS = 24 * 60 * 60_000;

type Stage = 'triage_start' | 'triage_wait' | 'enrich_start' | 'enrich_wait' | 'scoring_start' | 'scoring_wait' | 'done' | 'failed';

interface JobState {
  analyzedCommentIds?: string[];
  triageRunId?: string;
  triageCacheKey?: string;
  triage?: TriageOutput;
  triageModel?: string;
  triageStartedAt?: number;
  triageCompletedAt?: number;
  scoringStartedAt?: number;
  scoringCompletedAt?: number;
  enrichmentIds?: string[];
  enrichmentNote?: string;
  scoringRunId?: string;
  scoringCacheKey?: string;
  triageAttempts?: number;
  scoringAttempts?: number;
  scoring?: ScoringOutput | null;
  analysisId?: string;
}

const newToken = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** Durably stores an event; repeats of the same (investigationId, graphRevision) are acknowledged only. */
export const receive = internalMutation({
  args: { event: v.string() },
  returns: v.object({ duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const event = JSON.parse(args.event) as InvestigationReadyEvent;
    if (!validateModel('InvestigationReadyEvent', event).valid) throw new Error('Invalid investigation.ready event.');
    const existing = await ctx.db
      .query('jobs')
      .withIndex('by_investigation_revision', q => q.eq('investigationId', event.investigationId).eq('graphRevision', event.graphRevision))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { deliveries: existing.deliveries + 1 });
      return { duplicate: true };
    }
    const now = Date.now();
    const token = newToken();
    const jobId = await ctx.db.insert('jobs', {
      investigationId: event.investigationId,
      graphRevision: event.graphRevision,
      graphFingerprint: event.graphFingerprint,
      eventId: event.eventId,
      deliveries: 1,
      stage: 'triage_start',
      state: '{}',
      stageStartedAt: now,
      stepToken: token,
      updatedAt: now,
      expiresAt: now + 24 * 60 * 60_000,
    });
    await ctx.scheduler.runAfter(0, internal.worker.step, { jobId, token });
    return { duplicate: false };
  },
});

const claimed = v.object({
  investigationId: v.string(),
  graphRevision: v.number(),
  graphFingerprint: v.string(),
  stage: v.string(),
  state: v.string(),
  stageStartedAt: v.number(),
});

/**
 * Takes the job for one step. Fails if another step holds it or if the step was
 * scheduled before the job last moved on (stale token), so a CREAO webhook and
 * a scheduled poll can never both advance it.
 */
export const claim = internalMutation({
  args: { jobId: v.id('jobs'), token: v.string() },
  returns: v.union(v.null(), claimed),
  handler: async (ctx, { jobId, token }) => {
    const job = await ctx.db.get(jobId);
    const now = Date.now();
    if (!job || (job.expiresAt ?? Infinity) <= now || job.stage === 'done' || job.stage === 'failed') return null;
    if (job.stepToken !== token || (job.leaseUntil ?? 0) > now) return null;
    await ctx.db.patch(jobId, { leaseUntil: now + LEASE_MS });
    const { investigationId, graphRevision, graphFingerprint, stage, state, stageStartedAt } = job;
    return { investigationId, graphRevision, graphFingerprint, stage, state, stageStartedAt };
  },
});

/** Saves progress, releases the lease and returns the token the next step must carry (null once the job expired). */
export const saveJob = internalMutation({
  args: {
    jobId: v.id('jobs'),
    stage: v.string(),
    state: v.string(),
    newStage: v.boolean(),
    activeRunId: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    const now = Date.now();
    const job = await ctx.db.get(args.jobId);
    if (!job || (job.expiresAt ?? Infinity) <= now) return null;
    const token = newToken();
    await ctx.db.patch(args.jobId, {
      stage: args.stage,
      state: args.state,
      updatedAt: now,
      stepToken: token,
      leaseUntil: undefined,
      activeRunId: args.activeRunId,
      ...(args.newStage ? { stageStartedAt: now } : {}),
      ...(args.error ? { error: args.error } : {}),
    });
    return token;
  },
});

/** Called from the CREAO webhook route: wakes the job waiting on this run now instead of at its next poll. */
export const wakeForRun = internalMutation({
  args: { runId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { runId }) => {
    const job = await ctx.db.query('jobs').withIndex('by_active_run', q => q.eq('activeRunId', runId)).first();
    if (!job || !job.stepToken || (job.expiresAt ?? Infinity) <= Date.now() || job.stage === 'done' || job.stage === 'failed') return false;
    await ctx.scheduler.runAfter(0, internal.worker.step, { jobId: job._id, token: job.stepToken });
    return true;
  },
});

export const cacheGet = internalQuery({
  args: { key: v.string() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, { key }) => {
    const row = await ctx.db.query('modelCache').withIndex('by_key', q => q.eq('key', key)).first();
    return row && row.expiresAt > Date.now() ? row.output : null;
  },
});

export const cachePut = internalMutation({
  args: { key: v.string(), stage: v.string(), output: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('modelCache').withIndex('by_key', q => q.eq('key', args.key)).first();
    // Same 24-hour limit as job state (backend/RETENTION.md); the retention sweep deletes expired rows.
    const now = Date.now();
    if (existing) await ctx.db.patch(existing._id, { output: args.output, createdAt: now, expiresAt: now + CACHE_TTL_MS });
    else await ctx.db.insert('modelCache', { ...args, createdAt: now, expiresAt: now + CACHE_TTL_MS });
    return null;
  },
});

/** Job status for operators (`npx convex run worker:status`). Never exposes model replies. */
export const status = internalQuery({
  args: {},
  returns: v.array(v.object({ investigationId: v.string(), graphRevision: v.number(), stage: v.string(), deliveries: v.number(), error: v.optional(v.string()) })),
  handler: async ctx => {
    const jobs = await ctx.db.query('jobs').order('desc').take(50);
    return jobs.map(j => ({ investigationId: j.investigationId, graphRevision: j.graphRevision, stage: j.stage, deliveries: j.deliveries, ...(j.error ? { error: j.error } : {}) }));
  },
});

function backend(): BackendClient {
  const baseUrl = process.env.BACKEND_BASE_URL;
  if (!baseUrl) throw new BackendError(0, 'BACKEND_NOT_CONFIGURED', 'BACKEND_BASE_URL is not set.', false);
  return createBackendClient({ baseUrl, jwtSecret: process.env.BACKEND_JWT_SECRET, staticToken: process.env.BACKEND_API_TOKEN });
}

function claudeConfig(): ClaudeConfig | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return apiKey ? { apiKey, model: process.env.ANTHROPIC_MODEL || DEFAULT_CLAUDE_MODEL } : null;
}

function creaoFor(graph: GraphEnvelope): CreaoClient {
  const apiKey = process.env.CREAO_API_KEY;
  if (apiKey) {
    return createCreaoClient({
      apiKey,
      appId: process.env.CREAO_APP_ID,
      agentId: process.env.CREAO_AGENT_ID,
      model: process.env.CREAO_MODEL,
      webhookUrl: process.env.CREAO_WEBHOOK_URL,
    });
  }
  // Without a key, only labeled synthetic fixtures can be analyzed, from recorded replies.
  const recorded = recordedResponsesFor(graph);
  if (recorded) return new MockCreaoClient(recorded);
  throw new CreaoError('CREAO_API_KEY is not set.', 'CREAO_NOT_CONFIGURED', false);
}

/** With a webhook configured, polling is only a fallback. */
const creaoPollMs = () => 5_000;

/** Returns candidate reply texts when the run completed, null while it is still running. */
async function pollRun(creao: CreaoClient, runId: string, elapsedMs: number): Promise<string[] | null> {
  const run = await creao.getRun(runId);
  if (run.status === 'completed') {
    if (run.outputs.length === 0) throw new Error('CREAO run completed without result text.');
    return run.outputs;
  }
  if (run.status === 'failed' || run.status === 'cancelled') throw new Error(`CREAO run ${run.status}: ${run.errorCode ?? 'no error code'}`);
  if (elapsedMs > STAGE_DEADLINE_MS) throw new Error('CREAO run did not finish within the stage deadline.');
  return null;
}

/** Keyed by stage, prompt version, the model that answers, and the exact evidence. */
const cacheKey = async (stage: string, model: string, evidence: string) => sha256Hex(`${stage}\n${PROMPT_VERSION}\n${model}\n${evidence}`);

export const step = internalAction({
  args: { jobId: v.id('jobs'), token: v.string() },
  returns: v.null(),
  handler: async (ctx, { jobId, token }) => {
    const job = await ctx.runMutation(internal.worker.claim, { jobId, token });
    if (!job) return null;
    const state = JSON.parse(job.state) as JobState;
    const id = job.investigationId;
    const elapsed = Date.now() - job.stageStartedAt;

    const save = (stage: Stage, opts: { activeRunId?: string; error?: string } = {}) =>
      ctx.runMutation(internal.worker.saveJob, {
        jobId,
        stage,
        state: JSON.stringify(state),
        newStage: stage !== job.stage,
        ...(opts.activeRunId ? { activeRunId: opts.activeRunId } : {}),
        ...(opts.error ? { error: opts.error.slice(0, 2000) } : {}),
      });
    const next = async (stage: Stage, delayMs = 0, activeRunId?: string) => {
      const nextToken = await save(stage, { activeRunId });
      if (nextToken === null) return; // expired: stop processing
      await ctx.scheduler.runAfter(delayMs, internal.worker.step, { jobId, token: nextToken });
    };

    try {
      const api = backend();
      const graph = await api.getGraph(id);
      if (graph.graphRevision !== job.graphRevision || graph.graphFingerprint !== job.graphFingerprint) {
        return void (await save('failed', { error: 'STALE_EVENT: graph revision or fingerprint differs from the event.' }));
      }
      const claude = claudeConfig();
      const creao = creaoFor(graph);
      const completedJobs = () => fetchCompleted(api, id, state.enrichmentIds ?? []);
      const submitWith = (scoring: ScoringOutput | null) => {
        state.scoringCompletedAt ??= Date.now();
        return submit(api, graph, state, scoring, creao, save);
      };

      switch (job.stage as Stage) {
        case 'triage_start': {
          const { inputs, analyzedCommentIds } = triageInputs(graph);
          state.analyzedCommentIds = analyzedCommentIds;
          state.triageModel = claude ? `claude:${claude.model}` : creao.label;
          state.triageStartedAt ??= Date.now();
          state.triageCacheKey = await cacheKey('triage', claude ? `claude:${claude.model}` : creao.label, inputs.evidence);
          const cached = await ctx.runQuery(internal.worker.cacheGet, { key: state.triageCacheKey });
          if (cached) {
            state.triage = parseTriage(cached, analyzedCommentIds);
            state.triageCompletedAt = Date.now();
            return void (await next('enrich_start'));
          }
          if (claude) {
            state.triage = await parseWithRetries(() => claudeTriage(claude, inputs), outputs => parseTriage(outputs, analyzedCommentIds));
            state.triageCompletedAt = Date.now();
            await ctx.runMutation(internal.worker.cachePut, { key: state.triageCacheKey, stage: 'triage', output: JSON.stringify(state.triage) });
            return void (await next('enrich_start'));
          }
          state.triageRunId = await creao.startRun(inputs);
          state.triageAttempts = 1;
          return void (await next('triage_wait', creaoPollMs(), state.triageRunId));
        }
        case 'triage_wait': {
          const outputs = await pollRun(creao, state.triageRunId!, elapsed);
          if (outputs === null) return void (await next('triage_wait', creaoPollMs(), state.triageRunId));
          try {
            state.triage = parseTriage(outputs, state.analyzedCommentIds);
            state.triageCompletedAt = Date.now();
          } catch (err) {
            if (!(err instanceof ModelOutputError) || (state.triageAttempts ?? 1) >= MAX_STAGE_ATTEMPTS) throw err;
            state.triageAttempts = (state.triageAttempts ?? 1) + 1;
            state.triageRunId = await creao.startRun(triageInputs(graph).inputs);
            return void (await next('triage_wait', creaoPollMs(), state.triageRunId));
          }
          await ctx.runMutation(internal.worker.cachePut, { key: state.triageCacheKey!, stage: 'triage', output: JSON.stringify(state.triage) });
          return void (await next('enrich_start'));
        }
        case 'enrich_start': {
          // One request for a seeded random sample of supportive and unsupportive users.
          const request = enrichmentRequestFor(graph, state.triage!);
          if (request) {
            try {
              const created = await api.requestEnrichment(id, request, `dit-inference:enrich:sample:${id}:${graph.graphRevision}`);
              state.enrichmentIds = [created.enrichmentId];
            } catch (err) {
              if (err instanceof BackendError && err.retryable) throw err;
              state.enrichmentNote = `Some author histories could not be requested (${err instanceof BackendError ? err.code : 'error'}); rules that need them are unknown.`;
            }
          }
          return void (await next(state.enrichmentIds?.length ? 'enrich_wait' : 'scoring_start', state.enrichmentIds?.length ? ENRICHMENT_POLL_MS : 0));
        }
        case 'enrich_wait': {
          const jobs = await Promise.all((state.enrichmentIds ?? []).map(eid => api.getEnrichment(id, eid)));
          const pending = jobs.filter(j => j.status === 'queued' || j.status === 'running');
          if (pending.length && elapsed < ENRICHMENT_DEADLINE_MS) return void (await next('enrich_wait', ENRICHMENT_POLL_MS));
          if (pending.length) state.enrichmentNote = 'Some author histories did not arrive in time; rules that need them are unknown.';
          if (jobs.some(j => j.status === 'failed')) state.enrichmentNote = 'An author-history job failed; rules that need those histories are unknown.';
          state.enrichmentIds = jobs.filter(j => j.status === 'completed').map(j => j.enrichmentId);
          return void (await next('scoring_start'));
        }
        case 'scoring_start': {
          state.scoringStartedAt ??= Date.now();
          if (!needsScoring(state.triage!)) return void (await submitWith(null));
          const inputs = scoringInputs(graph, state.triage!, await completedJobs());
          state.scoringCacheKey = await cacheKey('scoring', creao.label, inputs.evidence);
          const cached = await ctx.runQuery(internal.worker.cacheGet, { key: state.scoringCacheKey });
          if (cached) return void (await submitWith(parseScoring(cached)));
          state.scoringRunId = await creao.startRun(inputs);
          state.scoringAttempts = 1;
          return void (await next('scoring_wait', creaoPollMs(), state.scoringRunId));
        }
        case 'scoring_wait': {
          const outputs = await pollRun(creao, state.scoringRunId!, elapsed);
          if (outputs === null) return void (await next('scoring_wait', creaoPollMs(), state.scoringRunId));
          let scoring: ScoringOutput;
          try {
            scoring = parseScoring(outputs);
            state.scoringCompletedAt = Date.now();
          } catch (err) {
            if (!(err instanceof ModelOutputError) || (state.scoringAttempts ?? 1) >= MAX_STAGE_ATTEMPTS) throw err;
            state.scoringAttempts = (state.scoringAttempts ?? 1) + 1;
            state.scoringRunId = await creao.startRun(scoringInputs(graph, state.triage!, await completedJobs()));
            return void (await next('scoring_wait', creaoPollMs(), state.scoringRunId));
          }
          await ctx.runMutation(internal.worker.cachePut, { key: state.scoringCacheKey!, stage: 'scoring', output: JSON.stringify(scoring) });
          return void (await submitWith(scoring));
        }
        default:
          return null;
      }
    } catch (err) {
      const retryable = (err instanceof CreaoError || err instanceof BackendError || err instanceof ClaudeError) && err.retryable;
      if (retryable && elapsed < STAGE_DEADLINE_MS) {
        const after = (err instanceof CreaoError || err instanceof ClaudeError) && err.retryAfterSeconds ? err.retryAfterSeconds * 1000 : RETRY_MS;
        const nextToken = await save(job.stage as Stage);
        if (nextToken !== null) await ctx.scheduler.runAfter(after, internal.worker.step, { jobId, token: nextToken });
        return null;
      }
      // The v1 API has no failure-report route; the backend keeps analysisStatus
      // as running. The reason stays here for operators.
      await save('failed', { error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
    }
    return null;
  },
});

async function parseWithRetries<T>(run: () => Promise<string[]>, parse: (outputs: string[]) => T): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return parse(await run());
    } catch (err) {
      if (!(err instanceof ModelOutputError) || attempt >= MAX_STAGE_ATTEMPTS) throw err;
    }
  }
}

async function fetchCompleted(api: BackendClient, investigationId: string, ids: string[]): Promise<EnrichmentJob[]> {
  const jobs = await Promise.all(ids.map(eid => api.getEnrichment(investigationId, eid)));
  return jobs.filter(j => j.status === 'completed');
}

async function submit(
  api: BackendClient,
  graph: GraphEnvelope,
  state: JobState,
  scoring: ScoringOutput | null,
  creao: CreaoClient,
  save: (stage: Stage, opts?: { error?: string }) => Promise<string | null>,
): Promise<void> {
  state.scoring = scoring;
  // Jobs predating model tracking used the deployed Opus default. Preserve
  // their provenance if configuration changes while they are still scoring.
  const triageModel = state.triageModel ?? (state.triageRunId ? creao.label : `claude:${DEFAULT_CLAUDE_MODEL}`);
  const enrichments = await fetchCompleted(api, graph.investigationId, state.enrichmentIds ?? []);
  const { submission } = assembleAnalysis({
    graph,
    triage: state.triage!,
    analyzedCommentIds: state.analyzedCommentIds ?? [],
    enrichments,
    enrichmentNote: state.enrichmentNote,
    scoring,
    modelLabel: triageModel.startsWith('claude:') ? `${triageModel}+${creao.label}` : triageModel,
  });
  const problem = checkSubmission(submission, graph, enrichments);
  if (problem) {
    await save('failed', { error: `Assembled analysis invalid (${problem.code}): ${problem.message}` });
    return;
  }
  try {
    const receipt = await api.submitAnalysis(graph.investigationId, submission, `dit-inference:analysis:${graph.investigationId}:${graph.graphRevision}`);
    state.analysisId = receipt.analysisId;
  } catch (err) {
    // A conflict means an earlier attempt of this job was already stored.
    const settled = err instanceof BackendError && (err.code === 'ANALYSIS_ALREADY_SUBMITTED' || err.code === 'IDEMPOTENCY_CONFLICT');
    if (!settled) throw err;
  }
  await save('done');
}

