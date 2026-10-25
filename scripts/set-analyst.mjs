import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify, parseEnv } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const deployment = 'grandiose-barracuda-22';

export function validateDeployKey(key) {
  if (!new RegExp(`^(dev|prod):${deployment}\\|.+$`).test(key || '')) {
    throw new Error(`INFERENCE_CONVEX_DEPLOY_KEY must be a scoped key for ${deployment}. No changes made.`);
  }
  return key;
}

export async function switchAnalyst(provider, run, dryRun = false) {
  if (!['claude', 'creao'].includes(provider)) throw new Error('Choose claude or creao.');
  // Capture privately: never forward CLI output containing credentials to logs.
  const env = parseEnv(await run(['env', 'list', '--include-values']));
  const key = env.CREAO_API_KEY?.trim() || '';
  const creaoReady = (key.startsWith('capi_') && env.CREAO_APP_ID?.trim()) ||
    (key.startsWith('cr_sk_') && env.CREAO_AGENT_ID?.trim());
  // The worker constructs its CREAO client even when Claude handles scoring.
  if (!creaoReady) throw new Error('Hosted CREAO credentials/agent ID are missing or invalid. No changes made.');
  if (provider === 'claude' && !env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error('Hosted ANTHROPIC_API_KEY is missing; Claude would fall back to CREAO. No changes made.');
  }
  if (dryRun) return `Preflight passed: ${provider} is configured on ${deployment}. No settings changed.`;
  await run(['env', 'set', 'SCORING_PROVIDER', provider]);
  const actual = (await run(['env', 'get', 'SCORING_PROVIDER'])).trim();
  if (actual !== provider) {
    throw new Error('Provider update could not be confirmed. The setting may have changed; rerun the script to verify.');
  }
  return `Production analyst: ${provider} (verified on ${deployment}). Effective for new scoring work now; cached reports and started runs remain available. No redeploy needed.`;
}

async function main() {
  const [provider, ...args] = process.argv.slice(2);
  let envFile = resolve(root, 'backend/.env.server.local');
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') dryRun = true;
    else if (args[i] === '--env-file' && args[i + 1]) envFile = resolve(args[++i]);
    else throw new Error('Usage: scripts/use-{claude,creao}-analyst.sh [--dry-run] [--env-file PATH]');
  }
  const inventory = parseEnv(await readFile(envFile, 'utf8'));
  const deployKey = validateDeployKey(inventory.INFERENCE_CONVEX_DEPLOY_KEY);
  const cli = resolve(root, 'inference/node_modules/convex/bin/main.js');
  const exec = promisify(execFile);
  const run = async (args) => {
    try {
      const { stdout } = await exec(process.execPath, [cli, ...args], {
        cwd: resolve(root, 'inference'),
        env: { ...process.env, CONVEX_DEPLOY_KEY: deployKey, NO_COLOR: '1' },
        timeout: 45_000,
        maxBuffer: 2 * 1024 * 1024,
      });
      return stdout;
    } catch {
      // Raw subprocess errors can contain captured secrets. Report only the operation.
      throw new Error(`Convex env ${args[1]} failed or timed out. Check inference dependencies (npm ci), connectivity and the scoped deploy key. If updating, the setting may have changed; rerun to verify.`);
    }
  };
  console.log(await switchAnalyst(provider, run, dryRun));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
