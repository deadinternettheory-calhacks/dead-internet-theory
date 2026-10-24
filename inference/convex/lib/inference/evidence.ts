// Cross-record checks for an AnalysisSubmission (contract section 6), shared by
// the inference worker before it submits and by the POST /analysis route.
import type { AnalysisSubmission, EnrichmentJob, GraphEnvelope } from '../contract';
import { isComment } from '../contract';
import { validateModel } from '../schema';

export interface SubmissionProblem {
  code: 'INVALID_ANALYSIS' | 'INVALID_EVIDENCE_REF' | 'STALE_GRAPH_REVISION';
  message: string;
}

/** IDs an analysis may cite: graph nodes plus history comments from the used enrichment jobs. */
export function knownEvidenceIds(graph: GraphEnvelope, jobs: EnrichmentJob[]): Set<string> {
  const ids = new Set(graph.nodes.map(n => n.id));
  for (const job of jobs) for (const r of job.results ?? []) for (const c of r.comments) ids.add(c.id);
  return ids;
}

export function checkSubmission(
  submission: unknown,
  graph: GraphEnvelope,
  usedJobs: EnrichmentJob[],
): SubmissionProblem | null {
  const schema = validateModel('AnalysisSubmission', submission);
  if (!schema.valid) return { code: 'INVALID_ANALYSIS', message: `Schema validation failed: ${schema.errors.join('; ')}` };
  const a = submission as AnalysisSubmission;

  if (a.graphRevision !== graph.graphRevision || a.graphFingerprint !== graph.graphFingerprint) {
    return { code: 'STALE_GRAPH_REVISION', message: 'graphRevision/graphFingerprint do not match the stored graph.' };
  }
  const usedIds = new Set(usedJobs.map(j => j.enrichmentId));
  for (const id of a.usedEnrichmentIds) {
    if (!usedIds.has(id)) return { code: 'INVALID_EVIDENCE_REF', message: `Unknown or incomplete enrichment ${id}.` };
  }

  const known = knownEvidenceIds(graph, usedJobs);
  const comments = new Set(graph.nodes.filter(isComment).map(n => n.id));
  const bad = (refs: string[], where: string): SubmissionProblem | null => {
    const missing = refs.filter(r => !known.has(r));
    return missing.length ? { code: 'INVALID_EVIDENCE_REF', message: `${where} cites unknown evidence: ${missing.slice(0, 5).join(', ')}` } : null;
  };

  const checks: (SubmissionProblem | null)[] = [
    bad(a.subject.evidenceRefs, 'subject'),
    bad(a.overallCoordinationRisk.evidenceRefs, 'overallCoordinationRisk'),
    ...a.axes.map(x => bad(x.evidenceRefs, `axis ${x.axis}`)),
    ...a.commentAssessments.map(c => bad(c.evidenceRefs, `assessment ${c.commentId}`)),
    ...a.commentAssessments.flatMap(c => [...(c.accountSignals?.signals ?? []), ...(c.accountSignals?.humanSignals ?? [])].map(x => bad(x.evidenceRefs, `account signals on ${c.commentId}`))),
    ...a.clusters.map(c => bad(c.evidenceRefs, `cluster ${c.clusterId}`)),
    ...a.inferredEdges.map(e => bad(e.evidenceRefs, 'inferred edge')),
  ];
  const first = checks.find(Boolean);
  if (first) return first;

  for (const c of a.commentAssessments) {
    if (!comments.has(c.commentId)) return { code: 'INVALID_EVIDENCE_REF', message: `Assessment target ${c.commentId} is not a discussion comment.` };
  }
  for (const cl of a.clusters) {
    if (new Set(cl.commentIds).size < 2 || cl.commentIds.some(id => !comments.has(id))) {
      return { code: 'INVALID_ANALYSIS', message: `Cluster ${cl.clusterId} needs two or more distinct discussion comments.` };
    }
  }
  for (const e of a.inferredEdges) {
    if (!comments.has(e.from) || !comments.has(e.to)) return { code: 'INVALID_ANALYSIS', message: 'Inferred edges must connect discussion comments.' };
  }
  const axisNames = a.axes.map(x => x.axis);
  if (new Set(axisNames).size !== axisNames.length) return { code: 'INVALID_ANALYSIS', message: 'Duplicate axis.' };
  for (const s of [a.overallCoordinationRisk, ...a.axes]) {
    if (s.score === null && s.confidence !== null) return { code: 'INVALID_ANALYSIS', message: 'A null score requires a null confidence.' };
  }
  const s = a.sentiment;
  const total = Object.values(s.counts).reduce((t, n) => t + n, 0);
  if (total !== s.analyzedCommentCount) return { code: 'INVALID_ANALYSIS', message: 'Sentiment counts must sum to analyzedCommentCount.' };
  if (s.population === 'retrieved_comments' && (s.method !== 'census_of_retrieved' || s.analyzedCommentCount !== graph.coverage.retrievedCommentCount)) {
    return { code: 'INVALID_ANALYSIS', message: 'A retrieved_comments population requires a census of every retrieved comment.' };
  }
  if (s.method !== 'census_of_retrieved' && s.population !== 'analyzed_sample') {
    return { code: 'INVALID_ANALYSIS', message: 'A sample cannot claim the full retrieved population.' };
  }
  return null;
}
