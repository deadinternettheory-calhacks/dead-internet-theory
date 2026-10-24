// Shapes the CREAO agent must return for each stage, plus strict parsing.
// Model output is untrusted draft data: it is parsed, schema-checked here, and
// then every claim is re-checked against the graph in scoring/assembly.
import { Validator } from '@cfworker/json-schema';
import type { Stance, Subject } from '../contract';

export interface TriageComment {
  commentId: string;
  stance: Stance;
  /** Product, brand or service this comment recommends, or null. */
  recommendsProduct: string | null;
  /** True when it recommends the discussion's main subject. */
  recommendsSubject: boolean;
  /** The exact product the stance is about, resolved from the reply chain; null means the subject. */
  aboutProduct?: string | null;
  rationale: string;
}

export interface TriageOutput {
  subject: Subject;
  comments: TriageComment[];
}

export interface ProposedSignal {
  id: string;
  points?: number;
  evidence: string;
  evidenceRefs: string[];
}

export interface ProposedAssessment {
  commentId: string;
  label: 'scored' | 'disclosed_promotion' | 'not_applicable';
  product: string | null;
  signals: ProposedSignal[];
  exculpatory: ProposedSignal[];
  unknown: string[];
  summary: string;
}

export interface ProposedCluster {
  commentIds: string[];
  signalIds: string[];
  explanation: string;
  evidenceRefs: string[];
}

export interface ScoringOutput {
  assessments: ProposedAssessment[];
  clusters: ProposedCluster[];
  overallSummary: string;
}

const stringArray = { type: 'array', items: { type: 'string' } };
const signal = {
  type: 'object',
  required: ['id', 'evidence', 'evidenceRefs'],
  properties: {
    id: { type: 'string', pattern: '^[CBTXE][0-9]$' },
    points: { type: 'number' },
    evidence: { type: 'string' },
    evidenceRefs: stringArray,
  },
};

export const TRIAGE_OUTPUT_SCHEMA = {
  type: 'object',
  required: ['subject', 'comments'],
  properties: {
    subject: {
      type: 'object',
      required: ['label', 'kind', 'confidence', 'evidenceRefs'],
      properties: {
        label: { type: 'string', minLength: 1 },
        kind: { enum: ['product', 'service', 'idea', 'brand', 'other', 'unknown'] },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        evidenceRefs: stringArray,
      },
    },
    comments: {
      type: 'array',
      items: {
        type: 'object',
        required: ['commentId', 'stance', 'recommendsProduct', 'recommendsSubject', 'rationale'],
        properties: {
          commentId: { type: 'string' },
          stance: { enum: ['supportive', 'critical', 'neutral', 'mixed', 'unclear'] },
          recommendsProduct: { type: ['string', 'null'] },
          recommendsSubject: { type: 'boolean' },
          aboutProduct: { type: ['string', 'null'] },
          rationale: { type: 'string' },
        },
      },
    },
  },
} as const;

export const SCORING_OUTPUT_SCHEMA = {
  type: 'object',
  required: ['assessments', 'clusters', 'overallSummary'],
  properties: {
    assessments: {
      type: 'array',
      items: {
        type: 'object',
        required: ['commentId', 'label', 'product', 'signals', 'exculpatory', 'unknown', 'summary'],
        properties: {
          commentId: { type: 'string' },
          label: { enum: ['scored', 'disclosed_promotion', 'not_applicable'] },
          product: { type: ['string', 'null'] },
          signals: { type: 'array', items: signal },
          exculpatory: { type: 'array', items: signal },
          unknown: stringArray,
          summary: { type: 'string' },
        },
      },
    },
    clusters: {
      type: 'array',
      items: {
        type: 'object',
        required: ['commentIds', 'signalIds', 'explanation', 'evidenceRefs'],
        properties: {
          commentIds: stringArray,
          signalIds: stringArray,
          explanation: { type: 'string' },
          evidenceRefs: stringArray,
        },
      },
    },
    overallSummary: { type: 'string' },
  },
} as const;

export class ModelOutputError extends Error {}

/** Pull one JSON object out of model text, tolerating code fences or stray prose. */
export function extractJsonObject(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  if (start < 0) throw new ModelOutputError('Model output contained no JSON object.');
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, i + 1));
        } catch {
          throw new ModelOutputError('Model output JSON could not be parsed.');
        }
      }
    }
  }
  throw new ModelOutputError('Model output JSON was not closed.');
}

function parseWith<T>(schema: object, text: string, label: string): T {
  const value = extractJsonObject(text);
  const result = new Validator(schema as never, '2020-12', false).validate(value);
  if (!result.valid) {
    const detail = result.errors.slice(0, 5).map(e => `${e.instanceLocation}: ${e.error}`).join('; ');
    throw new ModelOutputError(`${label} output failed validation: ${detail}`);
  }
  return value as T;
}

/** Parses the first candidate reply that yields valid output; otherwise throws the first error. */
function parseFirst<T>(schema: object, outputs: string | string[], label: string): T {
  const candidates = typeof outputs === 'string' ? [outputs] : outputs;
  if (candidates.length === 0) throw new ModelOutputError(`${label} run returned no text.`);
  let first: unknown;
  for (const text of candidates) {
    try {
      return parseWith<T>(schema, text, label);
    } catch (err) {
      first ??= err;
    }
  }
  throw first;
}

export function parseTriage(outputs: string | string[]): TriageOutput {
  return parseFirst<TriageOutput>(TRIAGE_OUTPUT_SCHEMA, outputs, 'Triage');
}

export function parseScoring(outputs: string | string[]): ScoringOutput {
  return parseFirst<ScoringOutput>(SCORING_OUTPUT_SCHEMA, outputs, 'Scoring');
}
