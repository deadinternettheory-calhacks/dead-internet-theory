// Receiver for investigation.ready events pushed by the ingestion backend
// (backend/INTEGRATION.md, "Inference consumer workflow"). Point the backend's
// INFERENCE_EVENT_URL at <this deployment's .convex.site URL>/events.
import { httpRouter } from 'convex/server';
import { internal } from './_generated/api';
import { httpAction } from './_generated/server';
import type { InvestigationReadyEvent } from './lib/contract';
import { validateModel } from './lib/schema';

const http = httpRouter();
const MAX_EVENT_BYTES = 4096;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Constant-time comparison of the bearer credential. */
export function bearerMatches(header: string | null, expected: string | undefined): boolean {
  if (!expected || !header?.startsWith('Bearer ')) return false;
  const a = new TextEncoder().encode(header.slice(7));
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

http.route({
  path: '/events',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    if (!bearerMatches(request.headers.get('Authorization'), process.env.INFERENCE_EVENT_TOKEN)) {
      return json(401, { error: { code: 'UNAUTHORIZED', message: 'Invalid event credential.', retryable: false } });
    }
    const text = await request.text();
    if (text.length > MAX_EVENT_BYTES) return json(413, { error: { code: 'INVALID_REQUEST', message: 'Event too large.', retryable: false } });
    let event: unknown;
    try {
      event = JSON.parse(text);
    } catch {
      return json(400, { error: { code: 'INVALID_REQUEST', message: 'Event must be JSON.', retryable: false } });
    }
    if (!validateModel('InvestigationReadyEvent', event).valid) {
      return json(400, { error: { code: 'INVALID_REQUEST', message: 'Not a valid InvestigationReadyEvent.', retryable: false } });
    }
    // Acknowledge only after the event is durably stored (and deduplicated).
    const outcome = await ctx.runMutation(internal.worker.receive, { event: JSON.stringify(event as InvestigationReadyEvent) });
    return json(202, { accepted: true, duplicate: outcome.duplicate });
  }),
});

/**
 * CREAO terminal-result webhook (CREAO_WEBHOOK_URL). CREAO cannot send custom
 * headers, so the secret travels in the URL query (`?token=`). The body is only
 * a wake-up signal: the worker still fetches and validates the run itself.
 * Deliveries repeat (X-Creao-Delivery-Id); waking an idle or finished job is harmless.
 */
http.route({
  path: '/creao-webhook',
  method: 'POST',
  handler: httpAction(async (ctx, request) => {
    const token = new URL(request.url).searchParams.get('token');
    if (!bearerMatches(token ? `Bearer ${token}` : null, process.env.CREAO_WEBHOOK_SECRET)) {
      return json(401, { error: { code: 'UNAUTHORIZED', message: 'Invalid webhook token.', retryable: false } });
    }
    const text = await request.text();
    if (text.length > 1_000_000) return json(413, { error: { code: 'INVALID_REQUEST', message: 'Payload too large.', retryable: false } });
    let runId: unknown;
    try {
      const body = JSON.parse(text) as { runId?: unknown; run_id?: unknown };
      runId = body.runId ?? body.run_id;
    } catch {
      return json(400, { error: { code: 'INVALID_REQUEST', message: 'Payload must be JSON.', retryable: false } });
    }
    if (typeof runId !== 'string' || !/^[A-Za-z0-9-]{1,100}$/.test(runId)) {
      return json(400, { error: { code: 'INVALID_REQUEST', message: 'Missing runId.', retryable: false } });
    }
    const woke = await ctx.runMutation(internal.worker.wakeForRun, { runId });
    return json(200, { received: true, woke });
  }),
});

export default http;
