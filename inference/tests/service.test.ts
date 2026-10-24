import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import { bearerMatches } from '../convex/http';
import { BackendError, createBackendClient, mintInferenceToken } from '../convex/lib/backendClient';
import type { GraphEnvelope } from '../convex/lib/contract';
import { recordedResponsesFor } from '../convex/lib/fixtures';

const graph = JSON.parse(readFileSync(resolve(__dirname, '../fixtures/synthetic-espresso/graph.json'), 'utf8')) as GraphEnvelope;
const contractGraph = JSON.parse(readFileSync(resolve(__dirname, '../../contracts/examples/graph.json'), 'utf8')) as GraphEnvelope;
const secret = 'x'.repeat(48);

describe('backend client', () => {
  it('mints five-minute inference tokens scoped to one investigation', async () => {
    const token = await mintInferenceToken(secret, 'inv_1', 1_000_000);
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: 'dit-backend', audience: 'dit-v1', currentDate: new Date(1_000_100_000),
    });
    expect(payload).toMatchObject({ sub: 'dit-inference', role: 'inference', investigations: ['inv_1'], iat: 1_000_000, exp: 1_000_300 });
  });

  it('sends bearer auth and idempotency keys and validates responses', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(graph), { status: 200 });
    }) as unknown as typeof fetch;
    const client = createBackendClient({ baseUrl: 'http://backend.test/', staticToken: 'tok', fetchImpl });
    await expect(client.getGraph('inv_synthetic_espresso')).resolves.toMatchObject({ rootId: graph.rootId });
    expect(calls[0].url).toBe('http://backend.test/v1/investigations/inv_synthetic_espresso/graph');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(calls[0].init.redirect).toBe('error');
  });

  it('rejects responses that break the contract', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ nope: true }), { status: 200 })) as unknown as typeof fetch;
    const client = createBackendClient({ baseUrl: 'http://backend.test', staticToken: 'tok', fetchImpl });
    await expect(client.getGraph('inv_1')).rejects.toMatchObject({ code: 'BACKEND_CONTRACT_VIOLATION' });
  });

  it('maps backend error envelopes and keeps retryability', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: { code: 'NOT_READY', message: 'wait', retryable: true, requestId: 'r' } }), { status: 409 })) as unknown as typeof fetch;
    const client = createBackendClient({ baseUrl: 'http://backend.test', staticToken: 'tok', fetchImpl });
    const err = (await client.getGraph('inv_1').catch((e: unknown) => e)) as BackendError;
    expect(err).toBeInstanceOf(BackendError);
    expect(err).toMatchObject({ status: 409, code: 'NOT_READY', retryable: true });
  });

  it('requires credentials', () => {
    expect(() => createBackendClient({ baseUrl: 'http://backend.test' })).toThrow(/BACKEND_JWT_SECRET/);
  });
});

describe('event receiver', () => {
  it('compares the bearer credential exactly', () => {
    expect(bearerMatches('Bearer s3cret', 's3cret')).toBe(true);
    expect(bearerMatches('Bearer s3cre', 's3cret')).toBe(false);
    expect(bearerMatches('s3cret', 's3cret')).toBe(false);
    expect(bearerMatches('Bearer anything', undefined)).toBe(false);
  });
});

describe('recorded CREAO replies', () => {
  it('exist for both synthetic fixtures', () => {
    expect(recordedResponsesFor(graph)).not.toBeNull();
    const backendFixture = { ...contractGraph, coverage: { ...contractGraph.coverage, limitations: ['SYNTHETIC fixture. No public-user content was collected.'] } };
    expect(recordedResponsesFor(backendFixture)).not.toBeNull();
  });

  it('are never used for a graph that is not labeled synthetic', () => {
    const real = { ...graph, coverage: { ...graph.coverage, limitations: [] } };
    expect(recordedResponsesFor(real)).toBeNull();
  });
});

describe('backend fixture thread', () => {
  it('analyzes the ingestion backend fixture graph with recorded replies', async () => {
    const { runSequential } = await import('../convex/lib/inference/pipeline');
    const { MockCreaoClient } = await import('../convex/lib/inference/creao');
    const enrichment = JSON.parse(readFileSync(resolve(__dirname, '../../contracts/examples/enrichment-completed.json'), 'utf8'));
    const fixtureGraph = { ...contractGraph, coverage: { ...contractGraph.coverage, limitations: ['SYNTHETIC fixture. No public-user content was collected.'] } };
    const creao = new MockCreaoClient(recordedResponsesFor(fixtureGraph)!);
    const result = await runSequential(fixtureGraph, {
      creao,
      requestEnrichment: async request => {
        expect(request.authors).toEqual([{ authorId: 'reddit:author:t2_alex', anchorCommentId: 'reddit:comment:t1_a' }]);
        return enrichment;
      },
      getEnrichment: async () => enrichment,
      sleep: async () => {},
    });
    expect(result.submission.subject.label).toBe('NimbusPods');
    expect(result.submission.overallCoordinationRisk.score).toBe(0);
    expect(result.submission.clusters).toEqual([]);
  });
});
