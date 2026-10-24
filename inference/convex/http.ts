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

export default http;
