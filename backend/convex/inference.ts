// Inference worker: consumes investigation.ready and drives one analysis per
// graph revision through persisted stages, so no single Convex action has to
// wait for a whole CREAO run:
//   triage_start -> triage_wait -> enrich_start -> enrich_wait
//   -> scoring_start -> scoring_wait -> done | failed
// It calls the same internal contract functions as the REST routes, so its
// enrichment requests and analysis submission get identical validation.
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery, type ActionCtx } from './_generated/server';
import type { EnrichmentJob, GraphEnvelope, InvestigationReadyEvent } from './lib/contract';
import { SYNTHETIC_CREAO_RESPONSES, SYNTHETIC_GRAPH } from './lib/fixtures';
import { assembleAnalysis } from './lib/inference/assemble';
import { createCreaoClient, CreaoError, MockCreaoClient, type CreaoClient, type CreaoInputs } from './lib/inference/creao';
import { parseScoring, parseTriage, type ScoringOutput, type TriageOutput } from './lib/inference/outputs';
import { enrichmentRequestFor, needsScoring, scoringInputs, triageInputs } from './lib/inference/pipeline';
import { validateModel } from './lib/schema';
import { canonicalJson, sha256Hex } from './lib/util';

const CREAO_POLL_MS = 5_000;
const CREAO_STAGE_DEADLINE_MS = 15 * 60_000;
const ENRICHMENT_POLL_MS = 3_000;
const ENRICHMENT_DEADLINE_MS = 5 * 60_000;
const PRINCIPAL = 'inference';

type Stage = 'triage_start' | 'triage_wait' | 'enrich_start' | 'enrich_wait' | 'scoring_start' | 'scoring_wait' | 'done' | 'failed';

interface JobState {
  analyzedCommentIds?: string[];
  triageRunId?: string;
  triage?: TriageOutput;
  enrichmentId?: string;
  enrichmentNote?: string;
  scoringRunId?: string;
  scoring?: ScoringOutput | null;
}

export const onReady = internalMutation({
  args: { event: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = JSON.parse(args.event) as InvestigationReadyEvent;
    if (!validateModel('InvestigationReadyEvent', event).valid) throw new Error('Invalid investigation.ready event.');
    // At-least-once delivery: dedupe by (investigationId, graphRevision).
    const existing = await ctx.db
      .query('inferenceJobs')
      .withIndex('by_investigation_revision', q => q.eq('investigationId', event.investigationId).eq('graphRevision', event.graphRevision))
      .unique();
    if (existing) return null;
    const now = Date.now();
    const jobId = await ctx.db.insert('inferenceJobs', {
      investigationId: event.investigationId,
      graphRevision: event.graphRevision,
      eventId: event.eventId,
      stage: 'triage_start',
      state: '{}',
      polls: 0,
      stageStartedAt: now,
      updatedAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.inference.step, { jobId });
    return null;
  },
});

export const loadJob = internalQuery({
  args: { jobId: v.id('inferenceJobs') },
  returns: v.union(v.null(), v.object({ investigationId: v.string(), stage: v.string(), state: v.string(), polls: v.number(), stageStartedAt: v.number() })),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job) return null;
    return { investigationId: job.investigationId, stage: job.stage, state: job.state, polls: job.polls, stageStartedAt: job.stageStartedAt };
  },
});

export const saveJob = internalMutation({
  args: { jobId: v.id('inferenceJobs'), stage: v.string(), state: v.string(), polls: v.number(), newStage: v.boolean(), error: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      stage: args.stage,
      state: args.state,
      polls: args.polls,
      updatedAt: now,
      ...(args.newStage ? { stageStartedAt: now } : {}),
      ...(args.error ? { error: args.error } : {}),
    });
    return null;
  },
});

function creaoFor(graph: GraphEnvelope): CreaoClient {
  const apiKey = process.env.CREAO_API_KEY;
  if (apiKey) {
    return createCreaoClient({
      apiKey,
      appId: process.env.CREAO_APP_ID,
      agentId: process.env.CREAO_AGENT_ID,
      model: process.env.CREAO_MODEL,
    });
  }
  // Without a key, only the labeled synthetic fixture can be analyzed, using recorded responses.
  if (graph.graphFingerprint === SYNTHETIC_GRAPH.graphFingerprint) return new MockCreaoClient(SYNTHETIC_CREAO_RESPONSES);
  throw new CreaoError('CREAO_API_KEY is not set.', 'CREAO_NOT_CONFIGURED', false);
}

async function readJson<T>(promise: Promise<{ status: number; body: string }>): Promise<{ status: number; body: T }> {
  const result = await promise;
  return { status: result.status, body: JSON.parse(result.body) as T };
}

export const step = internalAction({
  args: { jobId: v.id('inferenceJobs') },
  returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.runQuery(internal.inference.loadJob, { jobId });
    if (!job || job.stage === 'done' || job.stage === 'failed') return null;
    const state = JSON.parse(job.state) as JobState;
    const investigationId = job.investigationId;

    const save = async (stage: Stage, opts: { polls?: number; error?: string } = {}) => {
      await ctx.runMutation(internal.inference.saveJob, {
        jobId,
        stage,
        state: JSON.stringify(state),
        polls: opts.polls ?? 0,
        newStage: stage !== job.stage,
        ...(opts.error ? { error: opts.error } : {}),
      });
    };
    const next = async (stage: Stage, delayMs = 0, polls = 0) => {
      await save(stage, { polls });
      await ctx.scheduler.runAfter(delayMs, internal.inference.step, { jobId });
    };
    const failJob = async (detail: string) => {
      // Internal detail stays in the job row; users see a generic message.
      await save('failed', { error: detail.slice(0, 2000) });
      await ctx.runMutation(internal.store.setAnalysisStatus, {
        investigationId,
        status: 'failed',
        errorCode: 'INFERENCE_FAILED',
        errorMessage: 'We could not finish analyzing this discussion.',
      });
    };

    try {
      const graphResult = await readJson<GraphEnvelope>(ctx.runQuery(internal.store.getGraph, { investigationId }));
      if (graphResult.status !== 200) return void (await failJob(`Graph unavailable: HTTP ${graphResult.status}`));
      const graph = graphResult.body;
      const creao = creaoFor(graph);
      const elapsed = Date.now() - job.stageStartedAt;

      switch (job.stage as Stage) {
        case 'triage_start': {
          const { inputs, analyzedCommentIds } = triageInputs(graph);
          state.analyzedCommentIds = analyzedCommentIds;
          state.triageRunId = await creao.startRun(inputs);
          await ctx.runMutation(internal.store.setAnalysisStatus, { investigationId, status: 'running' });
          return void (await next('triage_wait', CREAO_POLL_MS));
        }
        case 'triage_wait': {
          const text = await pollRun(creao, state.triageRunId!, elapsed);
          if (text === null) return void (await next('triage_wait', CREAO_POLL_MS, job.polls + 1));
          state.triage = parseTriage(text);
          return void (await next('enrich_start'));
        }
        case 'enrich_start': {
          const request = enrichmentRequestFor(graph, state.triage!);
          if (!request) return void (await next('scoring_start'));
          const body = JSON.stringify(request);
          const created = await readJson<EnrichmentJob & { error?: { code: string } }>(
            ctx.runMutation(internal.store.requestEnrichment, {
              principal: PRINCIPAL,
              key: `enrich-${investigationId}-${graph.graphRevision}`,
              requestHash: await sha256Hex(canonicalJson(request)),
              investigationId,
              request: body,
            }),
          );
          if (created.status !== 202) {
            state.enrichmentNote = `Author histories could not be requested (${created.body.error?.code ?? created.status}); rules that need them are unknown.`;
            return void (await next('scoring_start'));
          }
          state.enrichmentId = created.body.enrichmentId;
          return void (await next('enrich_wait', ENRICHMENT_POLL_MS));
        }
        case 'enrich_wait': {
          const current = await readJson<EnrichmentJob>(ctx.runQuery(internal.store.getEnrichment, { investigationId, enrichmentId: state.enrichmentId! }));
          const status = current.status === 200 ? current.body.status : 'failed';
          if (status === 'queued' || status === 'running') {
            if (elapsed < ENRICHMENT_DEADLINE_MS) return void (await next('enrich_wait', ENRICHMENT_POLL_MS, job.polls + 1));
            state.enrichmentNote = 'Author histories did not arrive in time; rules that need them are unknown.';
            state.enrichmentId = undefined;
          } else if (status === 'failed') {
            state.enrichmentNote = 'The author-history job failed; rules that need histories are unknown.';
            state.enrichmentId = undefined;
          }
          return void (await next('scoring_start'));
        }
        case 'scoring_start': {
          if (!needsScoring(state.triage!)) {
            state.scoring = null;
            return void (await submit(ctx, graph, state, failJob, () => save('done')));
          }
          const enrichment = await currentEnrichment(ctx, investigationId, state.enrichmentId);
          state.scoringRunId = await creao.startRun(scoringInputs(graph, state.triage!, enrichment) as CreaoInputs);
          return void (await next('scoring_wait', CREAO_POLL_MS));
        }
        case 'scoring_wait': {
          const text = await pollRun(creao, state.scoringRunId!, elapsed);
          if (text === null) return void (await next('scoring_wait', CREAO_POLL_MS, job.polls + 1));
          state.scoring = parseScoring(text);
          return void (await submit(ctx, graph, state, failJob, () => save('done')));
        }
        default:
          return null;
      }
    } catch (err) {
      if (err instanceof CreaoError && err.retryable && Date.now() - job.stageStartedAt < CREAO_STAGE_DEADLINE_MS) {
        await ctx.scheduler.runAfter((err.retryAfterSeconds ?? 10) * 1000, internal.inference.step, { jobId });
        return null;
      }
      await failJob(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    }
    return null;
  },
});

/** Returns result text when the run completed, null while it is still running. */
async function pollRun(creao: CreaoClient, runId: string, elapsedMs: number): Promise<string | null> {
  const run = await creao.getRun(runId);
  if (run.status === 'completed') {
    if (!run.text) throw new Error('CREAO run completed without result text.');
    return run.text;
  }
  if (run.status === 'failed' || run.status === 'cancelled') throw new Error(`CREAO run ${run.status}: ${run.errorCode ?? 'no error code'}`);
  if (elapsedMs > CREAO_STAGE_DEADLINE_MS) throw new Error('CREAO run did not finish within the stage deadline.');
  return null;
}

async function currentEnrichment(ctx: ActionCtx, investigationId: string, enrichmentId: string | undefined): Promise<EnrichmentJob | null> {
  if (!enrichmentId) return null;
  const result = await readJson<EnrichmentJob>(ctx.runQuery(internal.store.getEnrichment, { investigationId, enrichmentId }));
  return result.status === 200 && result.body.status === 'completed' ? result.body : null;
}

async function submit(
  ctx: ActionCtx,
  graph: GraphEnvelope,
  state: JobState,
  failJob: (detail: string) => Promise<void>,
  markDone: () => Promise<void>,
): Promise<void> {
  const enrichment = await currentEnrichment(ctx, graph.investigationId, state.enrichmentId);
  const { submission } = assembleAnalysis({
    graph,
    triage: state.triage!,
    analyzedCommentIds: state.analyzedCommentIds ?? [],
    enrichment,
    enrichmentNote: state.enrichmentNote,
    scoring: state.scoring ?? null,
    modelLabel: creaoFor(graph).label,
  });
  const result = await readJson<{ error?: { code: string; message: string } }>(
    ctx.runMutation(internal.store.submitAnalysis, {
      principal: PRINCIPAL,
      key: `analysis-${graph.investigationId}-${graph.graphRevision}`,
      requestHash: await sha256Hex(canonicalJson(submission)),
      investigationId: graph.investigationId,
      submission: JSON.stringify(submission),
    }),
  );
  if (result.status === 201 || result.body.error?.code === 'ANALYSIS_ALREADY_SUBMITTED') return markDone();
  await failJob(`Analysis rejected: ${result.body.error?.code} ${result.body.error?.message}`);
}

