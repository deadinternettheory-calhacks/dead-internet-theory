// CREAO client. Two documented ways to run an agent (docs.creao.ai/pro/api-trigger):
// - App-scoped API Trigger: `capi_` key, POST https://agent.creao.ai/api/v1/apps/{appId}/runs
//   with {"inputs": {...}}, then GET .../runs/{id}.
// - CREAO CLI / Developer API: `cr_sk_` key, POST https://developer.creao.ai/v1/runs with
//   {"agent_id", "input"}, then GET /v1/runs/{run_id}.
// Both are async: start a run, poll until completed/failed/cancelled, then read
// result.text, the full reply in result.chatText (or chat_text), and any JSON
// file artifacts. Agents may put a short summary in text and the requested JSON
// in the chat reply or a file, so all are kept as candidates.
// Keys are server-side secrets and must never reach the browser or the repository.

export type CreaoStage = 'triage' | 'scoring';

export interface CreaoInputs {
  stage: CreaoStage;
  instructions: string;
  /** JSON-encoded evidence packet; untrusted data for the agent. */
  evidence: string;
}

export interface CreaoRunState {
  runId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  /** Candidate reply texts in order: result.text, the full chat reply, then JSON artifacts. */
  outputs: string[];
  errorCode: string | null;
}

export interface CreaoClient {
  readonly label: string;
  startRun(inputs: CreaoInputs): Promise<string>;
  getRun(runId: string): Promise<CreaoRunState>;
}

export class CreaoError extends Error {
  constructor(message: string, readonly code: string, readonly retryable: boolean, readonly retryAfterSeconds?: number) {
    super(message);
  }
}

export interface CreaoConfig {
  apiKey: string;
  /** Agent (app) ID for `capi_` keys. */
  appId?: string;
  /** Agent ID for `cr_sk_` keys. */
  agentId?: string;
  /** Optional model id, `cr_sk_` path only. */
  model?: string;
  agentBaseUrl?: string;
  developerBaseUrl?: string;
  fetchImpl?: typeof fetch;
}

const MAX_INPUT_BYTES = 256 * 1024;
const MAX_ARTIFACT_CHARS = 1_000_000;
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

export function createCreaoClient(config: CreaoConfig): CreaoClient {
  const key = config.apiKey.trim();
  if (key.startsWith('capi_')) {
    if (!config.appId) throw new CreaoError('CREAO_APP_ID is required for an app-scoped capi_ key.', 'CREAO_NOT_CONFIGURED', false);
    return new HttpCreaoClient(config, 'app');
  }
  if (key.startsWith('cr_sk_')) {
    if (!config.agentId) throw new CreaoError('CREAO_AGENT_ID is required for a cr_sk_ key.', 'CREAO_NOT_CONFIGURED', false);
    return new HttpCreaoClient(config, 'developer');
  }
  throw new CreaoError('CREAO_API_KEY must start with capi_ or cr_sk_.', 'CREAO_NOT_CONFIGURED', false);
}

class HttpCreaoClient implements CreaoClient {
  readonly label: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: CreaoConfig, private readonly mode: 'app' | 'developer') {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.label = mode === 'app' ? 'creao-app-trigger' : `creao-developer${config.model ? `:${config.model}` : ''}`;
  }

  private runsUrl(runId?: string): string {
    if (this.mode === 'app') {
      const base = (this.config.agentBaseUrl ?? 'https://agent.creao.ai').replace(/\/$/, '');
      return `${base}/api/v1/apps/${encodeURIComponent(this.config.appId!)}/runs${runId ? `/${encodeURIComponent(runId)}` : ''}`;
    }
    const base = (this.config.developerBaseUrl ?? 'https://developer.creao.ai').replace(/\/$/, '');
    return `${base}/v1/runs${runId ? `/${encodeURIComponent(runId)}` : ''}`;
  }

  private async request(url: string, init: RequestInit): Promise<Record<string, unknown>> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        ...init,
        headers: { Authorization: `Bearer ${this.config.apiKey.trim()}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      });
    } catch {
      throw new CreaoError('Could not reach CREAO.', 'CREAO_UNREACHABLE', true);
    }
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const code = typeof body.error === 'string' ? body.error : (body.error as { code?: string } | undefined)?.code ?? `HTTP_${response.status}`;
      const retryAfter = Number(response.headers.get('Retry-After'));
      const retryable = response.status === 429 || response.status >= 500;
      // Never include the request body or key in errors.
      throw new CreaoError(`CREAO request failed with ${response.status} ${code}.`, code, retryable, Number.isFinite(retryAfter) ? retryAfter : undefined);
    }
    return body;
  }

  async startRun(inputs: CreaoInputs): Promise<string> {
    const body = this.mode === 'app'
      ? { inputs }
      : { agent_id: this.config.agentId, input: inputs, ...(this.config.model ? { model: this.config.model } : {}) };
    const serialized = JSON.stringify(body);
    if (new TextEncoder().encode(serialized).length > MAX_INPUT_BYTES) {
      throw new CreaoError('Evidence packet exceeds the CREAO 256 KB input limit.', 'INPUT_TOO_LARGE', false);
    }
    const run = await this.request(this.runsUrl(), { method: 'POST', body: serialized });
    const runId = (run.id ?? run.run_id) as string | undefined;
    if (!runId) throw new CreaoError('CREAO did not return a run ID.', 'CREAO_BAD_RESPONSE', true);
    return runId;
  }

  /**
   * Agents may write the requested JSON to a file instead of replying with it.
   * Downloads up to three small JSON artifacts. CREAO's stable artifact URL needs
   * the key and redirects to temporary storage; the key is never sent to the
   * redirect target.
   */
  private async jsonArtifacts(artifacts: unknown): Promise<string[]> {
    if (!Array.isArray(artifacts)) return [];
    const texts: string[] = [];
    const candidates = artifacts
      .filter((a): a is { id?: string; title?: string; type?: string; url?: string } => !!a && typeof a === 'object')
      .filter(a => typeof a.url === 'string' && (a.type === 'application/json' || /\.json$/i.test(a.id ?? '') || /\.json$/i.test(a.title ?? '')))
      .slice(0, 3);
    for (const artifact of candidates) {
      try {
        const url = new URL(artifact.url!);
        if (url.protocol !== 'https:') continue;
        const creaoHost = url.hostname === 'agent.creao.ai' || url.hostname === 'developer.creao.ai';
        let response = await this.fetchImpl(url.href, {
          method: 'GET',
          redirect: 'manual',
          headers: creaoHost ? { Authorization: `Bearer ${this.config.apiKey.trim()}` } : {},
          signal: AbortSignal.timeout(20_000),
        });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('Location');
          if (!location || !location.startsWith('https://')) continue;
          response = await this.fetchImpl(location, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(20_000) });
        }
        if (!response.ok) continue;
        const text = await response.text();
        if (text.length <= MAX_ARTIFACT_CHARS) texts.push(text);
      } catch {
        // An unreadable artifact is skipped; other reply texts may still be valid.
      }
    }
    return texts;
  }

  async getRun(runId: string): Promise<CreaoRunState> {
    const run = await this.request(this.runsUrl(runId), { method: 'GET' });
    const status = String(run.status ?? 'pending') as CreaoRunState['status'];
    const result = (run.result ?? {}) as { text?: unknown; chatText?: unknown; chat_text?: unknown; artifacts?: unknown };
    const outputs = [result.text, result.chatText, result.chat_text].filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
    if (status === 'completed') outputs.push(...(await this.jsonArtifacts(result.artifacts)));
    const error = run.error as { code?: string } | undefined;
    return {
      runId,
      status: TERMINAL.has(status) || status === 'running' ? status : 'pending',
      outputs: Array.from(new Set(outputs)),
      errorCode: (run.errorCode as string | undefined) ?? error?.code ?? null,
    };
  }
}

/** Replays fixed responses per stage. Used for the synthetic demo and tests only. */
export class MockCreaoClient implements CreaoClient {
  readonly label = 'creao-mock';
  constructor(private readonly responses: Record<CreaoStage, string>) {}
  async startRun(inputs: CreaoInputs): Promise<string> {
    return `mock-${inputs.stage}`;
  }
  async getRun(runId: string): Promise<CreaoRunState> {
    const stage = runId.replace(/^mock-/, '') as CreaoStage;
    const text = this.responses[stage];
    if (text === undefined) return { runId, status: 'failed', outputs: [], errorCode: 'MOCK_NO_RESPONSE' };
    return { runId, status: 'completed', outputs: [text], errorCode: null };
  }
}
