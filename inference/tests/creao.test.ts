import { describe, expect, it } from 'vitest';
import { createCreaoClient, CreaoError } from '../convex/lib/inference/creao';

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: { status: number; body: unknown; headers?: Record<string, string> }[]) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift()!;
    return new Response(JSON.stringify(next.body), { status: next.status, headers: next.headers });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

const inputs = { stage: 'triage' as const, instructions: 'do it', evidence: '{}' };

describe('CREAO client', () => {
  it('uses the app-scoped API Trigger for capi_ keys', async () => {
    const { calls, impl } = fakeFetch([
      { status: 202, body: { id: 'run-1', status: 'pending', appId: 'app-1' } },
      { status: 200, body: { id: 'run-1', status: 'completed', result: { text: '{"ok":true}' } } },
    ]);
    const client = createCreaoClient({ apiKey: 'capi_test', appId: 'app-1', fetchImpl: impl });
    expect(await client.startRun(inputs)).toBe('run-1');
    expect(calls[0].url).toBe('https://agent.creao.ai/api/v1/apps/app-1/runs');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ inputs });
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer capi_test');
    const run = await client.getRun('run-1');
    expect(calls[1].url).toBe('https://agent.creao.ai/api/v1/apps/app-1/runs/run-1');
    expect(run).toEqual({ runId: 'run-1', status: 'completed', outputs: ['{"ok":true}'], errorCode: null });
  });

  it('uses the developer API for cr_sk_ keys', async () => {
    const { calls, impl } = fakeFetch([
      { status: 202, body: { run_id: 'run-2', status: 'pending' } },
      { status: 200, body: { run_id: 'run-2', status: 'failed', error: { code: 'EXECUTION_FAILED' } } },
    ]);
    const client = createCreaoClient({ apiKey: 'cr_sk_test', agentId: 'agent-1', model: 'anthropic/claude-sonnet-5-5', fetchImpl: impl });
    expect(await client.startRun(inputs)).toBe('run-2');
    expect(calls[0].url).toBe('https://developer.creao.ai/v1/runs');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ agent_id: 'agent-1', input: inputs, model: 'anthropic/claude-sonnet-5-5' });
    expect((await client.getRun('run-2')).errorCode).toBe('EXECUTION_FAILED');
  });

  it('requires the agent ID that matches the key type', () => {
    expect(() => createCreaoClient({ apiKey: 'capi_x' })).toThrow(/CREAO_APP_ID/);
    expect(() => createCreaoClient({ apiKey: 'cr_sk_x' })).toThrow(/CREAO_AGENT_ID/);
    expect(() => createCreaoClient({ apiKey: 'sk-other' })).toThrow(/capi_ or cr_sk_/);
  });

  it('maps errors without leaking the key and marks rate limits retryable', async () => {
    const { impl } = fakeFetch([{ status: 429, body: { error: 'RATE_LIMITED' }, headers: { 'Retry-After': '7' } }]);
    const client = createCreaoClient({ apiKey: 'capi_secret_value', appId: 'a', fetchImpl: impl });
    const err = (await client.startRun(inputs).catch((e: unknown) => e)) as CreaoError;
    expect(err).toBeInstanceOf(CreaoError);
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.retryable).toBe(true);
    expect(err.retryAfterSeconds).toBe(7);
    expect(err.message).not.toContain('capi_secret_value');
  });

  it('refuses inputs over the 256 KB limit before calling CREAO', async () => {
    const { calls, impl } = fakeFetch([]);
    const client = createCreaoClient({ apiKey: 'capi_x', appId: 'a', fetchImpl: impl });
    await expect(client.startRun({ ...inputs, evidence: 'x'.repeat(300_000) })).rejects.toMatchObject({ code: 'INPUT_TOO_LARGE' });
    expect(calls).toHaveLength(0);
  });
});

describe('CREAO reply candidates', () => {
  it('keeps the full chat reply when result.text is only a summary', async () => {
    const { calls, impl } = fakeFetch([
      { status: 200, body: { id: 'run-3', status: 'completed', result: { text: '{"stage":"triage","coordination_score":0.7}', chatText: 'Triage complete.\n```json\n{"subject":{}}\n```' } } },
    ]);
    const client = createCreaoClient({ apiKey: 'capi_x', appId: 'a', fetchImpl: impl });
    const run = await client.getRun('run-3');
    expect(calls).toHaveLength(1);
    expect(run.outputs).toHaveLength(2);
    expect(run.outputs[1]).toContain('```json');
  });
});

describe('CREAO JSON artifacts', () => {
  it('downloads JSON artifacts without sending the key to the storage redirect', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const impl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      if (url.endsWith('/runs/run-4')) {
        return new Response(JSON.stringify({ id: 'run-4', status: 'completed', result: {
          text: '{"stage":"scoring"}', chatText: 'Full cited JSON: `files/coordination_analysis.json`',
          artifacts: [
            { id: 'workspaces/u/t/files/coordination_analysis.json', title: 'coordination_analysis.json', type: 'application/json', url: 'https://agent.creao.ai/api/v1/runs/run-4/artifacts/download?artifactId=x' },
            { id: 'workspaces/u/t/files/report.pdf', title: 'Report', type: 'application/pdf', url: 'https://agent.creao.ai/api/v1/runs/run-4/artifacts/download?artifactId=y' },
          ],
        } }), { status: 200 });
      }
      if (url.includes('artifactId=x')) return new Response(null, { status: 302, headers: { Location: 'https://storage.example/signed?sig=1' } });
      if (url.startsWith('https://storage.example/')) return new Response('{"assessments":[],"clusters":[],"overallSummary":"ok"}', { status: 200 });
      throw new Error(`unexpected ${url}`);
    }) as unknown as typeof fetch;
    const client = createCreaoClient({ apiKey: 'capi_secret', appId: 'a', fetchImpl: impl });
    const run = await client.getRun('run-4');
    expect(run.outputs).toHaveLength(3);
    expect(run.outputs[2]).toContain('"overallSummary":"ok"');
    const download = calls.find(c => c.url.includes('artifactId=x'))!;
    expect((download.init.headers as Record<string, string>).Authorization).toBe('Bearer capi_secret');
    const storage = calls.find(c => c.url.startsWith('https://storage.example/'))!;
    expect(JSON.stringify(storage.init.headers ?? {})).not.toContain('capi_secret');
    expect(calls.some(c => c.url.includes('artifactId=y'))).toBe(false);
  });
});
