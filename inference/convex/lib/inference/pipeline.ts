// Stage builders shared by the Convex state machine (convex/inference.ts) and
// the sequential runner used by the demo generator and tests.
import type { EnrichmentJob, EnrichmentRequest, GraphEnvelope } from '../contract';
import { assembleAnalysis, type AssembleResult } from './assemble';
import { checkSubmission } from './evidence';
import type { CreaoClient, CreaoInputs } from './creao';
import { ModelOutputError, parseScoring, parseTriage, type ScoringOutput, type TriageOutput } from './outputs';
import { buildScoringPacket, buildTriagePacket, selectEnrichmentPairs } from './packet';
import { scoringInstructions, triageInstructions } from './prompts';

export const HISTORY_WINDOW_DAYS = 14;

export function triageInputs(graph: GraphEnvelope): { inputs: CreaoInputs; analyzedCommentIds: string[] } {
  const { packet, analyzedCommentIds } = buildTriagePacket(graph);
  return { inputs: { stage: 'triage', instructions: triageInstructions(), evidence: JSON.stringify(packet) }, analyzedCommentIds };
}

export function enrichmentRequestFor(graph: GraphEnvelope, triage: TriageOutput): EnrichmentRequest | null {
  const authors = selectEnrichmentPairs(graph, triage);
  return authors.length ? { authors, limit: 10, windowDays: HISTORY_WINDOW_DAYS, fallback: 'most_recent' } : null;
}

export function scoringInputs(graph: GraphEnvelope, triage: TriageOutput, job: EnrichmentJob | null): CreaoInputs {
  return { stage: 'scoring', instructions: scoringInstructions(), evidence: JSON.stringify(buildScoringPacket(graph, triage, job)) };
}

/** Recommendation comments exist, so the rubric stage has something to score. */
export function needsScoring(triage: TriageOutput): boolean {
  return triage.comments.some(c => !!c.recommendsProduct);
}

export interface SequentialDeps {
  creao: CreaoClient;
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

async function runStage<T>(creao: CreaoClient, makeInputs: () => CreaoInputs, parse: (outputs: string[]) => T, deps: SequentialDeps): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return parse(await runToText(creao, makeInputs(), deps));
    } catch (err) {
      if (!(err instanceof ModelOutputError) || attempt >= MAX_STAGE_ATTEMPTS) throw err;
    }
  }
}

/** Runs triage, optional enrichment, scoring and assembly in one process. */
export async function runSequential(graph: GraphEnvelope, deps: SequentialDeps): Promise<AssembleResult & { triage: TriageOutput; scoring: ScoringOutput | null; enrichment: EnrichmentJob | null }> {
  const { inputs, analyzedCommentIds } = triageInputs(graph);
  const triage = await runStage(deps.creao, () => inputs, parseTriage, deps);

  let enrichment: EnrichmentJob | null = null;
  const request = enrichmentRequestFor(graph, triage);
  if (request && deps.requestEnrichment && deps.getEnrichment) {
    enrichment = await deps.requestEnrichment(request);
    const sleep = deps.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
    for (let i = 0; i < 120 && (enrichment.status === 'queued' || enrichment.status === 'running'); i++) {
      await sleep(deps.pollIntervalMs ?? 5000);
      enrichment = await deps.getEnrichment(enrichment.enrichmentId);
    }
  }

  const scoring = needsScoring(triage) ? await runStage(deps.creao, () => scoringInputs(graph, triage, enrichment), parseScoring, deps) : null;
  const result = assembleAnalysis({ graph, triage, analyzedCommentIds, enrichment, scoring, inferredAt: deps.inferredAt, modelLabel: deps.creao.label });
  const problem = checkSubmission(result.submission, graph, enrichment && enrichment.status === 'completed' ? [enrichment] : []);
  if (problem) throw new Error(`Assembled analysis is invalid (${problem.code}): ${problem.message}`);
  return { ...result, triage, scoring, enrichment };
}
