// v1 REST routes from contracts/openapi.yaml, served at the deployment's
// .convex.site URL. Handlers revalidate input, then call internal functions in
// ./store.ts that hold all state-changing logic.
import { httpRouter } from 'convex/server';
import { internal } from './_generated/api';
import { httpAction } from './_generated/server';
import type { CapabilityResponseLike } from './lib/capabilities';
import { capabilities } from './lib/capabilities';
import { fail, type ApiResult, type WireResult } from './lib/result';
import { validateModel } from './lib/schema';
import { validateSourceUrl } from './lib/sourceUrl';
import { canonicalJson, isValidIdempotencyKey, sha256Hex } from './lib/util';

const http = httpRouter();

function corsHeaders(request: Request): Record<string, string> {
  const allowed = (process.env.ALLOWED_ORIGINS ?? '*').split(',').map(s => s.trim()).filter(Boolean);
  const origin = request.headers.get('Origin');
  const allowOrigin = allowed.includes('*') ? '*' : origin && allowed.includes(origin) ? origin : allowed[0] ?? '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function respond(request: Request, result: ApiResult | WireResult): Response {
  const requestId = crypto.randomUUID();
  let body = typeof result.body === 'string' ? (JSON.parse(result.body) as Record<string, unknown>) : (result.body as Record<string, unknown>);
  if (body && typeof body === 'object' && 'error' in body && body.error && typeof body.error === 'object') {
    body = { ...body, error: { ...(body.error as object), requestId } };
  }
  return new Response(JSON.stringify(body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId, ...corsHeaders(request) },
  });
}

/** Write routes for inference need the service token; frontend routes are open (see backend/README.md). */
function requireInference(request: Request): ApiResult | null {
  const token = process.env.INFERENCE_API_TOKEN;
  if (!token) return fail(403, 'FORBIDDEN', 'Inference write routes are disabled on this deployment.');
  if (request.headers.get('Authorization') !== `Bearer ${token}`) return fail(401, 'UNAUTHORIZED', 'A valid inference bearer token is required.');
  return null;
}

async function readBody(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; result: ApiResult }> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, result: fail(400, 'INVALID_REQUEST', 'The request body must be JSON.') };
  }
}

function idempotencyKey(request: Request): string | ApiResult {
  const key = request.headers.get('Idempotency-Key');
  return isValidIdempotencyKey(key) ? key : fail(400, 'INVALID_REQUEST', 'Idempotency-Key header (8-128 printable ASCII characters) is required.');
}

const ID = '[A-Za-z0-9_-]{1,128}';
const routes = {
  investigation: new RegExp(`^/v1/investigations/(${ID})$`),
  graph: new RegExp(`^/v1/investigations/(${ID})/graph$`),
  analysis: new RegExp(`^/v1/investigations/(${ID})/analysis$`),
  enrichments: new RegExp(`^/v1/investigations/(${ID})/enrichments$`),
  enrichment: new RegExp(`^/v1/investigations/(${ID})/enrichments/(${ID})$`),
};

http.route({
  path: '/v1/investigations',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const key = idempotencyKey(request);
    if (typeof key !== 'string') return respond(request, key);
    const body = await readBody(request);
    if (!body.ok) return respond(request, body.result);
    if (!validateModel('InvestigationCreateRequest', body.value).valid) {
      return respond(request, fail(400, 'INVALID_REQUEST', 'Body must be {"sourceUrl": "<https URL>"} with no other fields.'));
    }
    const source = validateSourceUrl((body.value as { sourceUrl: string }).sourceUrl);
    if (!source.ok) return respond(request, fail(400, 'INVALID_URL', source.reason));
    const result = await ctx.runMutation(internal.store.createInvestigation, {
      principal: 'frontend',
      key,
      requestHash: await sha256Hex(canonicalJson({ sourceUrl: source.sourceUrl })),
      sourceUrl: source.sourceUrl,
      platform: source.platform,
    });
    return respond(request, result);
  }),
});

http.route({
  pathPrefix: '/v1/investigations/',
  method: 'GET',
  handler: httpAction(async (ctx, request) => {
    const path = new URL(request.url).pathname;
    let m: RegExpExecArray | null;
    if ((m = routes.investigation.exec(path))) return respond(request, await ctx.runQuery(internal.store.getInvestigation, { investigationId: m[1] }));
    if ((m = routes.graph.exec(path))) return respond(request, await ctx.runQuery(internal.store.getGraph, { investigationId: m[1] }));
    if ((m = routes.analysis.exec(path))) return respond(request, await ctx.runQuery(internal.store.getAnalysis, { investigationId: m[1] }));
    if ((m = routes.enrichment.exec(path))) {
      return respond(request, await ctx.runQuery(internal.store.getEnrichment, { investigationId: m[1], enrichmentId: m[2] }));
    }
    return respond(request, fail(404, 'INVESTIGATION_NOT_FOUND', 'Route not found.'));
  }),
});

http.route({
  pathPrefix: '/v1/investigations/',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const path = new URL(request.url).pathname;
    const enrich = routes.enrichments.exec(path);
    const analysis = routes.analysis.exec(path);
    if (!enrich && !analysis) return respond(request, fail(404, 'INVESTIGATION_NOT_FOUND', 'Route not found.'));
    const denied = requireInference(request);
    if (denied) return respond(request, denied);
    const key = idempotencyKey(request);
    if (typeof key !== 'string') return respond(request, key);
    const body = await readBody(request);
    if (!body.ok) return respond(request, body.result);
    const requestHash = await sha256Hex(canonicalJson(body.value));
    if (enrich) {
      return respond(request, await ctx.runMutation(internal.store.requestEnrichment, {
        principal: 'inference', key, requestHash, investigationId: enrich[1], request: JSON.stringify(body.value),
      }));
    }
    return respond(request, await ctx.runMutation(internal.store.submitAnalysis, {
      principal: 'inference', key, requestHash, investigationId: analysis![1], submission: JSON.stringify(body.value),
    }));
  }),
});

http.route({
  path: '/v1/capabilities',
  method: 'GET',
  handler: httpAction(async (_ctx, request) => respond(request, { status: 200, body: capabilities() satisfies CapabilityResponseLike })),
});

// CORS preflight for browser clients.
http.route({
  pathPrefix: '/v1/',
  method: 'OPTIONS',
  handler: httpAction(async (_ctx, request) => new Response(null, { status: 204, headers: corsHeaders(request) })),
});

export default http;
