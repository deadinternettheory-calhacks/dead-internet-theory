// v1 contract operations as internal Convex queries/mutations. convex/http.ts
// exposes them as REST routes; convex/inference.ts calls the same functions
// directly, so the inference worker goes through identical validation.
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc } from './_generated/dataModel';
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from './_generated/server';
import type {
  AnalysisReceipt,
  AnalysisResource,
  AnalysisStatus,
  AnalysisSubmission,
  EnrichmentJob,
  EnrichmentRequest,
  ErrorDetail,
  GraphEnvelope,
  InvestigationReadyEvent,
  InvestigationResource,
  Platform,
} from './lib/contract';
import { isAuthor, isComment, SCHEMA_VERSION } from './lib/contract';
import { checkSubmission } from './lib/inference/evidence';
import { fail, ok, toWire, type ApiResult } from './lib/result';
import { validateModel } from './lib/schema';
import { newId, utcNow } from './lib/util';

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const wire = v.object({ status: v.number(), body: v.string() });

// ---------- helpers ----------

async function investigationDoc(ctx: QueryCtx, investigationId: string): Promise<Doc<'investigations'> | null> {
  return ctx.db.query('investigations').withIndex('by_investigationId', q => q.eq('investigationId', investigationId)).unique();
}

function parseResource(doc: Doc<'investigations'>): InvestigationResource {
  return JSON.parse(doc.resource) as InvestigationResource;
}

async function graphFor(ctx: QueryCtx, resource: InvestigationResource): Promise<GraphEnvelope | null> {
  if (resource.ingestionStatus !== 'completed' || resource.graphRevision === null) return null;
  const doc = await ctx.db
    .query('graphs')
    .withIndex('by_investigation_revision', q => q.eq('investigationId', resource.investigationId).eq('graphRevision', resource.graphRevision!))
    .unique();
  return doc ? (JSON.parse(doc.graph) as GraphEnvelope) : null;
}

async function patchResource(ctx: MutationCtx, doc: Doc<'investigations'>, changes: Partial<InvestigationResource>): Promise<InvestigationResource> {
  const next: InvestigationResource = { ...parseResource(doc), ...changes, updatedAt: utcNow() };
  if (!changes.error && next.error && next.ingestionStatus !== 'failed' && next.analysisStatus !== 'failed') delete next.error;
  await ctx.db.patch(doc._id, { resource: JSON.stringify(next) });
  return next;
}

type Replay = { kind: 'new' } | { kind: 'replay'; result: ApiResult } | { kind: 'conflict' };

async function checkIdempotency(ctx: MutationCtx, principal: string, route: string, key: string, requestHash: string): Promise<Replay> {
  const existing = await ctx.db
    .query('idempotency')
    .withIndex('by_scope', q => q.eq('principal', principal).eq('route', route).eq('key', key))
    .unique();
  if (!existing) return { kind: 'new' };
  if (Date.now() - existing.createdAt > IDEMPOTENCY_TTL_MS) {
    await ctx.db.delete(existing._id);
    return { kind: 'new' };
  }
  if (existing.requestHash !== requestHash) return { kind: 'conflict' };
  return { kind: 'replay', result: { status: existing.status, body: JSON.parse(existing.response) } };
}

async function remember(ctx: MutationCtx, principal: string, route: string, key: string, requestHash: string, result: ApiResult) {
  await ctx.db.insert('idempotency', {
    principal,
    route,
    key,
    requestHash,
    status: result.status,
    response: JSON.stringify(result.body),
    createdAt: Date.now(),
  });
}

const conflict = () => fail(409, 'IDEMPOTENCY_CONFLICT', 'This Idempotency-Key was already used with a different request body.');
const notFound = () => fail(404, 'INVESTIGATION_NOT_FOUND', 'Investigation not found.');

// ---------- investigations ----------

export const createInvestigation = internalMutation({
  args: { principal: v.string(), key: v.string(), requestHash: v.string(), sourceUrl: v.string(), platform: v.string() },
  returns: wire,
  handler: async (ctx, args) => {
    const route = 'POST /v1/investigations';
    const prior = await checkIdempotency(ctx, args.principal, route, args.key, args.requestHash);
    if (prior.kind === 'conflict') return toWire(conflict());
    if (prior.kind === 'replay') return toWire(prior.result);

    const now = utcNow();
    const resource: InvestigationResource = {
      schemaVersion: SCHEMA_VERSION,
      investigationId: newId('inv'),
      sourceUrl: args.sourceUrl,
      platform: args.platform as Platform,
      ingestionStatus: 'queued',
      analysisStatus: 'waiting_for_graph',
      graphRevision: null,
      graphFingerprint: null,
      createdAt: now,
      updatedAt: now,
    };
    await ctx.db.insert('investigations', { investigationId: resource.investigationId, resource: JSON.stringify(resource) });
    await ctx.scheduler.runAfter(0, internal.ingestion.run, { investigationId: resource.investigationId });
    const result = ok(202, resource);
    await remember(ctx, args.principal, route, args.key, args.requestHash, result);
    return toWire(result);
  },
});

export const getInvestigation = internalQuery({
  args: { investigationId: v.string() },
  returns: wire,
  handler: async (ctx, { investigationId }) => {
    const doc = await investigationDoc(ctx, investigationId);
    return toWire(doc ? ok(200, parseResource(doc)) : notFound());
  },
});

export const getGraph = internalQuery({
  args: { investigationId: v.string() },
  returns: wire,
  handler: async (ctx, { investigationId }) => {
    const doc = await investigationDoc(ctx, investigationId);
    if (!doc) return toWire(notFound());
    const graph = await graphFor(ctx, parseResource(doc));
    return toWire(graph ? ok(200, graph) : fail(409, 'NOT_READY', 'The discussion graph is not ready yet.', true));
  },
});

// ---------- ingestion side (internal) ----------

export const markIngestionRunning = internalMutation({
  args: { investigationId: v.string() },
  returns: v.union(v.null(), v.object({ sourceUrl: v.string(), platform: v.string() })),
  handler: async (ctx, { investigationId }) => {
    const doc = await investigationDoc(ctx, investigationId);
    if (!doc) return null;
    const resource = parseResource(doc);
    if (resource.ingestionStatus !== 'queued') return null;
    await patchResource(ctx, doc, { ingestionStatus: 'running' });
    return { sourceUrl: resource.sourceUrl, platform: resource.platform };
  },
});

export const failIngestion = internalMutation({
  args: { investigationId: v.string(), code: v.string(), message: v.string(), retryable: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await investigationDoc(ctx, args.investigationId);
    if (!doc) return null;
    // analysisStatus stays waiting_for_graph when ingestion fails (contract section 3).
    await patchResource(ctx, doc, { ingestionStatus: 'failed', error: { code: args.code, message: args.message, retryable: args.retryable } });
    return null;
  },
});

/** Stores an immutable graph revision, then emits investigation.ready to inference. */
export const storeGraph = internalMutation({
  args: { investigationId: v.string(), graph: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await investigationDoc(ctx, args.investigationId);
    if (!doc) return null;
    const graph = JSON.parse(args.graph) as GraphEnvelope;
    const check = validateModel('GraphEnvelope', graph);
    if (!check.valid || graph.investigationId !== args.investigationId) {
      await patchResource(ctx, doc, { ingestionStatus: 'failed', error: { code: 'INTERNAL_ERROR', message: 'Collected data did not match the graph contract.', retryable: false } });
      return null;
    }
    await ctx.db.insert('graphs', {
      investigationId: graph.investigationId,
      graphRevision: graph.graphRevision,
      graphFingerprint: graph.graphFingerprint,
      graph: args.graph,
    });
    await patchResource(ctx, doc, {
      ingestionStatus: 'completed',
      analysisStatus: 'queued',
      graphRevision: graph.graphRevision,
      graphFingerprint: graph.graphFingerprint,
    });
    const event: InvestigationReadyEvent = {
      eventVersion: '1.0.0',
      eventId: newId('evt'),
      eventType: 'investigation.ready',
      investigationId: graph.investigationId,
      graphRevision: graph.graphRevision,
      graphFingerprint: graph.graphFingerprint,
      occurredAt: utcNow(),
    };
    await ctx.scheduler.runAfter(0, internal.inference.onReady, { event: JSON.stringify(event) });
    return null;
  },
});

// ---------- enrichment ----------

function checkPairs(request: EnrichmentRequest, graph: GraphEnvelope): ApiResult | null {
  const nodes = new Map(graph.nodes.map(n => [n.id, n]));
  const seen = new Set<string>();
  for (const pair of request.authors) {
    const author = nodes.get(pair.authorId);
    const anchor = nodes.get(pair.anchorCommentId);
    if (!author || !isAuthor(author)) return fail(422, 'UNKNOWN_AUTHOR', `Unknown author ${pair.authorId}.`);
    if (!anchor || !isComment(anchor)) return fail(422, 'UNKNOWN_ANCHOR', `Unknown anchor comment ${pair.anchorCommentId}.`);
    if (anchor.authorId !== pair.authorId) return fail(422, 'ANCHOR_AUTHOR_MISMATCH', `Comment ${pair.anchorCommentId} was not written by ${pair.authorId}.`);
    const key = `${pair.authorId}|${pair.anchorCommentId}`;
    if (seen.has(key)) return fail(422, 'DUPLICATE_AUTHOR_ANCHOR', `Duplicate pair ${key}.`);
    seen.add(key);
  }
  return null;
}

export const requestEnrichment = internalMutation({
  args: { principal: v.string(), key: v.string(), requestHash: v.string(), investigationId: v.string(), request: v.string() },
  returns: wire,
  handler: async (ctx, args) => {
    const route = `POST /v1/investigations/${args.investigationId}/enrichments`;
    const prior = await checkIdempotency(ctx, args.principal, route, args.key, args.requestHash);
    if (prior.kind === 'conflict') return toWire(conflict());
    if (prior.kind === 'replay') return toWire(prior.result);

    const doc = await investigationDoc(ctx, args.investigationId);
    if (!doc) return toWire(notFound());
    const request = JSON.parse(args.request) as EnrichmentRequest;
    const schema = validateModel('EnrichmentRequest', request);
    if (!schema.valid) return toWire(fail(400, 'INVALID_REQUEST', `Invalid enrichment request: ${schema.errors.join('; ')}`));
    const graph = await graphFor(ctx, parseResource(doc));
    if (!graph) return toWire(fail(409, 'NOT_READY', 'The discussion graph is not ready yet.', true));
    const pairProblem = checkPairs(request, graph);
    if (pairProblem) return toWire(pairProblem);

    const job: EnrichmentJob = {
      schemaVersion: SCHEMA_VERSION,
      enrichmentId: newId('enr'),
      investigationId: args.investigationId,
      status: 'queued',
      createdAt: utcNow(),
      startedAt: null,
      completedAt: null,
    };
    await ctx.db.insert('enrichments', { enrichmentId: job.enrichmentId, investigationId: job.investigationId, request: args.request, job: JSON.stringify(job) });
    await ctx.scheduler.runAfter(0, internal.enrichment.fulfil, { enrichmentId: job.enrichmentId });
    const result = ok(202, job);
    await remember(ctx, args.principal, route, args.key, args.requestHash, result);
    return toWire(result);
  },
});

export const getEnrichment = internalQuery({
  args: { investigationId: v.string(), enrichmentId: v.string() },
  returns: wire,
  handler: async (ctx, args) => {
    const doc = await investigationDoc(ctx, args.investigationId);
    if (!doc) return toWire(notFound());
    const row = await ctx.db.query('enrichments').withIndex('by_enrichmentId', q => q.eq('enrichmentId', args.enrichmentId)).unique();
    if (!row || row.investigationId !== args.investigationId) return toWire(fail(404, 'ENRICHMENT_NOT_FOUND', 'Enrichment job not found.'));
    return toWire(ok(200, JSON.parse(row.job)));
  },
});

/** Ingestion-side read of a queued job and its graph, for fulfilment. */
export const enrichmentWork = internalQuery({
  args: { enrichmentId: v.string() },
  returns: v.union(v.null(), v.object({ request: v.string(), job: v.string(), graph: v.string() })),
  handler: async (ctx, { enrichmentId }) => {
    const row = await ctx.db.query('enrichments').withIndex('by_enrichmentId', q => q.eq('enrichmentId', enrichmentId)).unique();
    if (!row) return null;
    const doc = await investigationDoc(ctx, row.investigationId);
    const graph = doc ? await graphFor(ctx, parseResource(doc)) : null;
    if (!graph) return null;
    return { request: row.request, job: row.job, graph: JSON.stringify(graph) };
  },
});

export const saveEnrichmentJob = internalMutation({
  args: { job: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = JSON.parse(args.job) as EnrichmentJob;
    const check = validateModel('EnrichmentJob', job);
    if (!check.valid) throw new Error(`Enrichment job failed validation: ${check.errors.join('; ')}`);
    const row = await ctx.db.query('enrichments').withIndex('by_enrichmentId', q => q.eq('enrichmentId', job.enrichmentId)).unique();
    if (row) await ctx.db.patch(row._id, { job: args.job });
    return null;
  },
});

// ---------- analysis ----------

const SUBMISSION_STATUS: Record<string, number> = { INVALID_ANALYSIS: 422, INVALID_EVIDENCE_REF: 422, STALE_GRAPH_REVISION: 409 };

export const submitAnalysis = internalMutation({
  args: { principal: v.string(), key: v.string(), requestHash: v.string(), investigationId: v.string(), submission: v.string() },
  returns: wire,
  handler: async (ctx, args) => {
    const route = `POST /v1/investigations/${args.investigationId}/analysis`;
    const prior = await checkIdempotency(ctx, args.principal, route, args.key, args.requestHash);
    if (prior.kind === 'conflict') return toWire(conflict());
    if (prior.kind === 'replay') return toWire(prior.result);

    const doc = await investigationDoc(ctx, args.investigationId);
    if (!doc) return toWire(notFound());
    const resource = parseResource(doc);
    const graph = await graphFor(ctx, resource);
    if (!graph) return toWire(fail(409, 'NOT_READY', 'The discussion graph is not ready yet.', true));
    const submission = JSON.parse(args.submission) as AnalysisSubmission;

    const existing = await ctx.db
      .query('analyses')
      .withIndex('by_investigation_revision', q => q.eq('investigationId', args.investigationId).eq('graphRevision', graph.graphRevision))
      .unique();
    if (existing) return toWire(fail(409, 'ANALYSIS_ALREADY_SUBMITTED', 'An analysis was already submitted for this graph revision.'));

    const usedJobs: EnrichmentJob[] = [];
    for (const id of Array.isArray(submission?.usedEnrichmentIds) ? submission.usedEnrichmentIds : []) {
      const row = await ctx.db.query('enrichments').withIndex('by_enrichmentId', q => q.eq('enrichmentId', id)).unique();
      const job = row && row.investigationId === args.investigationId ? (JSON.parse(row.job) as EnrichmentJob) : null;
      if (job && job.status === 'completed') usedJobs.push(job);
    }
    const problem = checkSubmission(submission, graph, usedJobs);
    if (problem) return toWire(fail(SUBMISSION_STATUS[problem.code] ?? 422, problem.code, problem.message));

    const stored: AnalysisResource = {
      schemaVersion: SCHEMA_VERSION,
      analysisId: newId('anl'),
      investigationId: args.investigationId,
      storedAt: utcNow(),
      result: submission,
    };
    await ctx.db.insert('analyses', {
      analysisId: stored.analysisId,
      investigationId: stored.investigationId,
      graphRevision: graph.graphRevision,
      analysis: JSON.stringify(stored),
    });
    await patchResource(ctx, doc, { analysisStatus: 'completed' });
    const receipt: AnalysisReceipt = { schemaVersion: SCHEMA_VERSION, analysisId: stored.analysisId, investigationId: stored.investigationId, storedAt: stored.storedAt };
    const result = ok(201, receipt);
    await remember(ctx, args.principal, route, args.key, args.requestHash, result);
    return toWire(result);
  },
});

export const getAnalysis = internalQuery({
  args: { investigationId: v.string() },
  returns: wire,
  handler: async (ctx, { investigationId }) => {
    const doc = await investigationDoc(ctx, investigationId);
    if (!doc) return toWire(notFound());
    const resource = parseResource(doc);
    if (resource.analysisStatus !== 'completed' || resource.graphRevision === null) {
      return toWire(fail(409, 'ANALYSIS_NOT_READY', 'Analysis is not completed.', resource.analysisStatus !== 'failed'));
    }
    const row = await ctx.db
      .query('analyses')
      .withIndex('by_investigation_revision', q => q.eq('investigationId', investigationId).eq('graphRevision', resource.graphRevision!))
      .unique();
    return toWire(row ? ok(200, JSON.parse(row.analysis)) : fail(409, 'ANALYSIS_NOT_READY', 'Analysis is not completed.', true));
  },
});

/** Inference-side status updates; the contract has no route for these. */
export const setAnalysisStatus = internalMutation({
  args: { investigationId: v.string(), status: v.string(), errorCode: v.optional(v.string()), errorMessage: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const doc = await investigationDoc(ctx, args.investigationId);
    if (!doc) return null;
    const current = parseResource(doc);
    if (current.analysisStatus === 'completed') return null;
    const error: ErrorDetail | undefined = args.errorCode
      ? { code: args.errorCode, message: args.errorMessage ?? 'Analysis failed.', retryable: false }
      : undefined;
    await patchResource(ctx, doc, { analysisStatus: args.status as AnalysisStatus, ...(error ? { error } : {}) });
    return null;
  },
});
