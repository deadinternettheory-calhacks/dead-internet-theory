// Inference worker. Each investigation.ready event becomes one job that moves
// through persisted stages, each run by a separately scheduled action, so no
// Convex action waits for a whole CREAO run:
//   triage_start -> triage_wait -> enrich_start -> enrich_wait
//   -> scoring_start -> scoring_wait -> done | failed
// All reads and writes go to the ingestion backend's v1 API with stable
// idempotency keys (backend/INTEGRATION.md).
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { BackendError, createBackendClient, type BackendClient } from './lib/backendClient';
import type { EnrichmentJob, GraphEnvelope, InvestigationReadyEvent } from './lib/contract';
import { recordedResponsesFor } from './lib/fixtures';
import { assembleAnalysis } from './lib/inference/assemble';
import { createCreaoClient, CreaoError, MockCreaoClient, type CreaoClient } from './lib/inference/creao';
import { checkSubmission } from './lib/inference/evidence';
import { ModelOutputError, parseScoring, parseTriage, type ScoringOutput, type TriageOutput } from './lib/inference/outputs';
import { enrichmentRequestFor, MAX_STAGE_ATTEMPTS, needsScoring, scoringInputs, triageInputs } from './lib/inference/pipeline';
import { validateModel } from './lib/schema';

const CREAO_POLL_MS = 5_000;
const STAGE_DEADLINE_MS = 15 * 60_000;
const ENRICHMENT_POLL_MS = 3_000;
const ENRICHMENT_DEADLINE_MS = 5 * 60_000;
const RETRY_MS = 10_000;

type Stage = 'triage_start' | 'triage_wait' | 'enrich_start' | 'enrich_wait' | 'scoring_start' | 'scoring_wait' | 'done' | 'failed';

interface JobState {
  analyzedCommentIds?: string[];
  triageRunId?: string;
  triage?: TriageOutput;
  enrichmentId?: string;
  enrichmentNote?: string;
  scoringRunId?: string;
  /** CREAO runs started per stage, including retries after unusable replies. */
  triageAttempts?: number;
  scoringAttempts?: number;
  scoring?: ScoringOutput | null;
  analysisId?: string;
}

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
    const jobId = await ctx.db.insert('jobs', {
      investigationId: event.investigationId,
      graphRevision: event.graphRevision,
      graphFingerprint: event.graphFingerprint,
      eventId: event.eventId,
      deliveries: 1,
      stage: 'triage_start',
      state: '{}',
      stageStartedAt: now,
      updatedAt: now,
      expiresAt: now + 24 * 60 * 60_000,
    });
    await ctx.scheduler.runAfter(0, internal.worker.step, { jobId });
    return { duplicate: false };
  },
});

export const loadJob = internalQuery({
  args: { jobId: v.id('jobs') },
  returns: v.union(
    v.null(),
    v.object({ investigationId: v.string(), graphRevision: v.number(), graphFingerprint: v.string(), stage: v.string(), state: v.string(), stageStartedAt: v.number() }),
  ),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job || (job.expiresAt ?? Infinity) <= Date.now()) return null;
    const { investigationId, graphRevision, graphFingerprint, stage, state, stageStartedAt } = job;
    return { investigationId, graphRevision, graphFingerprint, stage, state, stageStartedAt };
  },
});

export const saveJob = internalMutation({
  args: { jobId: v.id('jobs'), stage: v.string(), state: v.string(), newStage: v.boolean(), error: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const job = await ctx.db.get(args.jobId);
    if (!job || (job.expiresAt ?? Infinity) <= now) return null;
    await ctx.db.patch(args.jobId, {
      stage: args.stage,
      state: args.state,
      updatedAt: now,
      ...(args.newStage ? { stageStartedAt: now } : {}),
      ...(args.error ? { error: args.error } : {}),
    });
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

function creaoFor(graph: GraphEnvelope): CreaoClient {
  const apiKey = process.env.CREAO_API_KEY;
  if (apiKey) {
    return createCreaoClient({ apiKey, appId: process.env.CREAO_APP_ID, agentId: process.env.CREAO_AGENT_ID, model: process.env.CREAO_MODEL });
  }
  // Without a key, only labeled synthetic fixtures can be analyzed, from recorded replies.
  const recorded = recordedResponsesFor(graph);
  if (recorded) return new MockCreaoClient(recorded);
  throw new CreaoError('CREAO_API_KEY is not set.', 'CREAO_NOT_CONFIGURED', false);
}

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

export const step = internalAction({
  args: { jobId: v.id('jobs') },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.runQuery(internal.worker.loadJob, { jobId });
    if (!job || job.stage === 'done' || job.stage === 'failed') return null;
    const state = JSON.parse(job.state) as JobState;
    const id = job.investigationId;
    const elapsed = Date.now() - job.stageStartedAt;

    const save = (stage: Stage, error?: string) =>
      ctx.runMutation(internal.worker.saveJob, { jobId, stage, state: JSON.stringify(state), newStage: stage !== job.stage, ...(error ? { error: error.slice(0, 2000) } : {}) });
    const next = async (stage: Stage, delayMs = 0) => {
      await save(stage);
      await ctx.scheduler.runAfter(delayMs, internal.worker.step, { jobId });
    };

    try {
      const api = backend();
      const graph = await api.getGraph(id);
      if (graph.graphRevision !== job.graphRevision || graph.graphFingerprint !== job.graphFingerprint) {
        return void (await save('failed', 'STALE_EVENT: graph revision or fingerprint differs from the event.'));
      }
      const creao = creaoFor(graph);
      const currentEnrichment = async (): Promise<EnrichmentJob | null> => {
        if (!state.enrichmentId) return null;
        const job = await api.getEnrichment(id, state.enrichmentId);
        return job.status === 'completed' ? job : null;
      };

      switch (job.stage as Stage) {
        case 'triage_start': {
          const { inputs, analyzedCommentIds } = triageInputs(graph);
          state.analyzedCommentIds = analyzedCommentIds;
          state.triageRunId = await creao.startRun(inputs);
          return void (await next('triage_wait', CREAO_POLL_MS));
        }
        case 'triage_wait': {
          const text = await pollRun(creao, state.triageRunId!, elapsed);
          if (text === null) return void (await next('triage_wait', CREAO_POLL_MS));
          try {
            state.triage = parseTriage(text);
          } catch (err) {
            if (!(err instanceof ModelOutputError) || (state.triageAttempts ?? 1) >= MAX_STAGE_ATTEMPTS) throw err;
            state.triageAttempts = (state.triageAttempts ?? 1) + 1;
            state.triageRunId = await creao.startRun(triageInputs(graph).inputs);
            return void (await next('triage_wait', CREAO_POLL_MS));
          }
          return void (await next('enrich_start'));
        }
        case 'enrich_start': {
          const request = enrichmentRequestFor(graph, state.triage!);
          if (!request) return void (await next('scoring_start'));
          try {
            const created = await api.requestEnrichment(id, request, `dit-inference:enrich:${id}:${graph.graphRevision}`);
            state.enrichmentId = created.enrichmentId;
            return void (await next('enrich_wait', ENRICHMENT_POLL_MS));
          } catch (err) {
            if (err instanceof BackendError && err.retryable) throw err;
            state.enrichmentNote = `Author histories could not be requested (${err instanceof BackendError ? err.code : 'error'}); rules that need them are unknown.`;
            return void (await next('scoring_start'));
          }
        }
        case 'enrich_wait': {
          const current = await api.getEnrichment(id, state.enrichmentId!);
          if (current.status === 'queued' || current.status === 'running') {
            if (elapsed < ENRICHMENT_DEADLINE_MS) return void (await next('enrich_wait', ENRICHMENT_POLL_MS));
            state.enrichmentNote = 'Author histories did not arrive in time; rules that need them are unknown.';
            state.enrichmentId = undefined;
          } else if (current.status === 'failed') {
            state.enrichmentNote = 'The author-history job failed; rules that need histories are unknown.';
            state.enrichmentId = undefined;
          }
          return void (await next('scoring_start'));
        }
        case 'scoring_start':
        case 'scoring_wait': {
          if (job.stage === 'scoring_start') {
            if (needsScoring(state.triage!)) {
              state.scoringRunId = await creao.startRun(scoringInputs(graph, state.triage!, await currentEnrichment()));
              return void (await next('scoring_wait', CREAO_POLL_MS));
            }
            state.scoring = null;
          } else {
            const text = await pollRun(creao, state.scoringRunId!, elapsed);
            if (text === null) return void (await next('scoring_wait', CREAO_POLL_MS));
            try {
              state.scoring = parseScoring(text);
            } catch (err) {
              if (!(err instanceof ModelOutputError) || (state.scoringAttempts ?? 1) >= MAX_STAGE_ATTEMPTS) throw err;
              state.scoringAttempts = (state.scoringAttempts ?? 1) + 1;
              state.scoringRunId = await creao.startRun(scoringInputs(graph, state.triage!, await currentEnrichment()));
              return void (await next('scoring_wait', CREAO_POLL_MS));
            }
          }
          const enrichment = await currentEnrichment();
          const { submission } = assembleAnalysis({
            graph,
            triage: state.triage!,
            analyzedCommentIds: state.analyzedCommentIds ?? [],
            enrichment,
            enrichmentNote: state.enrichmentNote,
            scoring: state.scoring ?? null,
            modelLabel: creao.label,
          });
          const problem = checkSubmission(submission, graph, enrichment ? [enrichment] : []);
          if (problem) return void (await save('failed', `Assembled analysis invalid (${problem.code}): ${problem.message}`));
          try {
            const receipt = await api.submitAnalysis(id, submission, `dit-inference:analysis:${id}:${graph.graphRevision}`);
            state.analysisId = receipt.analysisId;
          } catch (err) {
            // A conflict means an earlier attempt of this job was already stored.
            const settled = err instanceof BackendError && (err.code === 'ANALYSIS_ALREADY_SUBMITTED' || err.code === 'IDEMPOTENCY_CONFLICT');
            if (!settled) throw err;
          }
          return void (await save('done'));
        }
        default:
          return null;
      }
    } catch (err) {
      const retryable = (err instanceof CreaoError || err instanceof BackendError) && err.retryable;
      if (retryable && elapsed < STAGE_DEADLINE_MS) {
        const after = err instanceof CreaoError && err.retryAfterSeconds ? err.retryAfterSeconds * 1000 : RETRY_MS;
        await ctx.scheduler.runAfter(after, internal.worker.step, { jobId });
        return null;
      }
      // The v1 API has no failure-report route; the backend keeps analysisStatus
      // as running. The reason stays here for operators.
      await save('failed', err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    }
    return null;
  },
});
