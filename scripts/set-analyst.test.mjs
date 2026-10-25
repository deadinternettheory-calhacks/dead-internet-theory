import test from 'node:test';
import assert from 'node:assert/strict';
import { switchAnalyst, validateDeployKey } from './set-analyst.mjs';

const configured = 'CREAO_API_KEY=capi_test\nCREAO_APP_ID=agent\nANTHROPIC_API_KEY=test\n';

test('rejects ingestion, project and missing keys without exposing them', () => {
  for (const key of [undefined, 'dev:impartial-sheep-516|secret', 'project:secret']) {
    assert.throws(() => validateDeployKey(key), (error) => !error.message.includes('secret'));
  }
  assert.equal(validateDeployKey('dev:grandiose-barracuda-22|test'), 'dev:grandiose-barracuda-22|test');
});

for (const provider of ['claude', 'creao']) {
  test(`${provider} updates only scoring, verifies the hosted setting and preserves caches`, async () => {
    const calls = [];
    const result = await switchAnalyst(provider, async (args) => {
      calls.push(args);
      return args[1] === 'list' ? configured : args[1] === 'get' ? provider : '';
    });
    assert.deepEqual(calls, [
      ['env', 'list', '--include-values'],
      ['env', 'set', 'SCORING_PROVIDER', provider],
      ['env', 'get', 'SCORING_PROVIDER'],
    ]);
    assert.match(result, /verified/);
    assert.doesNotMatch(result, /capi_test/);
  });
}

test('refuses silent Claude fallback and missing CREAO config before writes', async () => {
  for (const env of ['', configured.replace('ANTHROPIC_API_KEY=test', ''), configured.replace('CREAO_APP_ID=agent', '')]) {
    const calls = [];
    await assert.rejects(switchAnalyst('claude', async (args) => { calls.push(args); return env; }));
    assert.equal(calls.length, 1);
  }
});

test('dry run validates live configuration without writing', async () => {
  const calls = [];
  await switchAnalyst('creao', async (args) => { calls.push(args); return configured; }, true);
  assert.deepEqual(calls, [['env', 'list', '--include-values']]);
});

test('does not claim success when readback differs or update fails', async () => {
  await assert.rejects(switchAnalyst('claude', async (args) => args[1] === 'list' ? configured : 'creao'), /could not be confirmed/);
  await assert.rejects(switchAnalyst('creao', async (args) => {
    if (args[1] === 'set') throw new Error('unavailable');
    return configured;
  }), /unavailable/);
});
