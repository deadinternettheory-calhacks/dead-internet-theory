// Stage builders shared by the Convex state machine (convex/worker.ts) and
// the sequential runner used by the demo generator and tests.
import type { AuthorAnchor, EnrichmentJob, EnrichmentRequest, GraphEnvelope } from '../contract';
import { assembleAnalysis, type AssembleResult } from './assemble';
import { checkSubmission } from './evidence';
import type { CreaoClient, CreaoInputs } from './creao';
import { ModelOutputError, parseScoring, parseTriage, type ScoringOutput, type TriageOutput } from './outputs';
import { buildScoringPacket, buildTriagePacket, sampleHistoryAuthors } from './packet';
import { claudeTriage, DEFAULT_CLAUDE_MODEL, type ClaudeConfig } from './claude';
import { scoringInstructions, triageInstructions } from './prompts';

export const HISTORY_WINDOW_DAYS = 14;

export function triageInputs(graph: GraphEnvelope): { inputs: CreaoInputs; analyzedCommentIds: string[] } {
  const { packet, analyzedCommentIds } = buildTriagePacket(graph);
  return { inputs: { stage: 'triage', instructions: triageInstructions(), evidence: JSON.stringify(packet) }, analyzedCommentIds };
}

function request(authors: AuthorAnchor[]): EnrichmentRequest | null {
  return authors.length ? { authors, limit: 10, windowDays: HISTORY_WINDOW_DAYS, fallback: 'most_recent' } : null;
}

/** One history request for a random sample of supportive and unsupportive users (see sampleHistoryAuthors). */
export function enrichmentRequestFor(graph: GraphEnvelope, triage: TriageOutput): EnrichmentRequest | null {
  return request(sampleHistoryAuthors(graph, triage).pairs);
}

export function scoringInputs(graph: GraphEnvelope, triage: TriageOutput, jobs: EnrichmentJob[]): CreaoInputs {
  return { stage: 'scoring', instructions: scoringInstructions(), evidence: JSON.stringify(buildScoringPacket(graph, triage, jobs)) };
}

/** Recommendation comments exist, so the rubric stage has something to score. */
export function needsScoring(triage: TriageOutput): boolean {
  return triage.comments.some(c => !!c.recommendsProduct);
}

export interface SequentialDeps {
  creao: CreaoClient;
  /** When set, triage runs as one direct Claude call instead of a CREAO run. */
  claude?: ClaudeConfig;
  requestEnrichment?: (request: EnrichmentRequest) => Promise<EnrichmentJob>;
  getEnrichment?: (enrichmentId: string) => Promise<EnrichmentJob>;
  sleep?: (ms: number) => Promise<void>;
  pollIntervalMs?: number;
  maxPolls?: number;
  inferredAt?: string;
}

async function runToText(creao: CreaoClient, inputs: CreaoInputs, deps: SequentialDeps): Promise<string[]> {
  const runId = await creao.startRun(inputs);
  const sleep = deps.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  for (let i = 0; i < (deps.maxPolls ?? 240); i++) {
    const run = await creao.getRun(runId);
    if (run.status === 'completed') {
      if (run.outputs.length === 0) throw new Error(`CREAO ${inputs.stage} run completed without text.`);
      return run.outputs;
    }
    if (run.status === 'failed' || run.status === 'cancelled') throw new Error(`CREAO ${inputs.stage} run ${run.status}: ${run.errorCode ?? 'no code'}.`);
    await sleep(deps.pollIntervalMs ?? 5000);
  }
  throw new Error(`CREAO ${inputs.stage} run did not finish in time.`);
}

/** CREAO agents sometimes reply without the requested JSON; run a stage this many times in total. */
export const MAX_STAGE_ATTEMPTS = 3;

async function runStage<T>(run: () => Promise<string[]>, parse: (outputs: string[]) => T): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return parse(await run());
    } catch (err) {
      if (!(err instanceof ModelOutputError) || attempt >= MAX_STAGE_ATTEMPTS) throw err;
    }
  }
}

/** Runs triage, the sampled history request, scoring and assembly in one process. */
export async function runSequential(graph: GraphEnvelope, deps: SequentialDeps): Promise<AssembleResult & { triage: TriageOutput; scoring: ScoringOutput | null; enrichments: EnrichmentJob[] }> {
  const { inputs, analyzedCommentIds } = triageInputs(graph);
  const canEnrich = !!(deps.requestEnrichment && deps.getEnrichment);
  const runTriage = () => (deps.claude ? claudeTriage(deps.claude, inputs) : runToText(deps.creao, inputs, deps));
  const triage = await runStage(runTriage, outputs => parseTriage(outputs, analyzedCommentIds));

  const jobs: EnrichmentJob[] = [];
  const sampled = canEnrich ? enrichmentRequestFor(graph, triage) : null;
  if (sampled) jobs.push(await deps.requestEnrichment!(sampled));
  const sleep = deps.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  for (let i = 0; i < jobs.length; i++) {
    for (let poll = 0; poll < 120 && (jobs[i].status === 'queued' || jobs[i].status === 'running'); poll++) {
      await sleep(deps.pollIntervalMs ?? 5000);
      jobs[i] = await deps.getEnrichment!(jobs[i].enrichmentId);
    }
  }

  const scoring = needsScoring(triage) ? await runStage(() => runToText(deps.creao, scoringInputs(graph, triage, jobs), deps), parseScoring) : null;
  const modelLabel = deps.claude ? `claude:${deps.claude.model ?? DEFAULT_CLAUDE_MODEL}+${deps.creao.label}` : deps.creao.label;
  const result = assembleAnalysis({ graph, triage, analyzedCommentIds, enrichments: jobs, scoring, inferredAt: deps.inferredAt, modelLabel });
  const problem = checkSubmission(result.submission, graph, jobs.filter(j => j.status === 'completed'));
  if (problem) throw new Error(`Assembled analysis is invalid (${problem.code}): ${problem.message}`);
  return { ...result, triage, scoring, enrichments: jobs };
}
