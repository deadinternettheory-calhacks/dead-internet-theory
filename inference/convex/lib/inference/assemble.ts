// Turns validated triage and rubric scores into a v1 AnalysisSubmission.
// The rubric-to-axis mapping and index formulas here are provisional and
// unvalidated; backend/README.md documents them.
import type {
  AnalysisSubmission,
  AxisAssessment,
  AxisName,
  ClusterAssessment,
  CommentAssessment,
  EnrichmentJob,
  GraphEnvelope,
  InferredEdge,
  Platform,
  Stance,
} from '../contract';
import { SCHEMA_VERSION } from '../contract';
import { unique, utcNow } from '../util';
import { communityFromUrl, daysBetween, mentions, round2, wordJaccard } from './features';
import type { ProposedAccount, ScoringOutput, TriageOutput } from './outputs';
import { GraphIndex, historyResults, sampleHistoryAuthors, scoringTargets } from './packet';
import { sectionIndex } from './section';
import { commentEstimate, threadSignals } from './signals';
import { PROMPT_VERSION } from './prompts';
import { CONFIDENCE_VALUE, RUBRIC_VERSION, RULES, RULES_BY_ID, hasAccountHistory } from './rubric';
import { scoreAccount, scoreComment, type CommentScore, type EvidenceAvailability } from './scoring';
import { knownEvidenceIds } from './evidence';

export const INFERENCE_VERSION = `dit-inference/0.2.0; rubric/${RUBRIC_VERSION}; ${PROMPT_VERSION}`;

const AXES: AxisName[] = [
  'promotional_intent',
  'semantic_coordination',
  'temporal_coordination',
  'account_anomalies',
  'engagement_anomalies',
  'disclosure_concerns',
];

const AXIS_LABEL: Record<AxisName, string> = {
  promotional_intent: 'Promotional intent',
  semantic_coordination: 'Similar wording across accounts',
  temporal_coordination: 'Timing',
  account_anomalies: 'Account patterns',
  engagement_anomalies: 'Interaction patterns',
  disclosure_concerns: 'Disclosure',
};

// Model text reaches users, so anything that reads as an accusation is replaced.
const ACCUSATORY = /\b(bots?|shills?|fake|paid (?:shill|actor|account)s?|astroturfers?|scam(?:mer)?s?|fraud(?:ulent)?|sock ?puppets?|troll farm)\b/i;
export function safeText(text: string, fallback: string): string {
  const trimmed = text.trim();
  return trimmed && !ACCUSATORY.test(trimmed) ? trimmed : fallback;
}

export interface AssembleInput {
  graph: GraphEnvelope;
  triage: TriageOutput;
  analyzedCommentIds: string[];
  /** Every enrichment job requested for this analysis (speculative and follow-up). */
  enrichments: EnrichmentJob[];
  enrichmentNote?: string;
  scoring: ScoringOutput | null;
  /** Dedicated history reviews take precedence over the broader rubric response. */
  accountReviews?: ProposedAccount[];
  inferredAt?: string;
  modelLabel?: string;
}

export interface AssembleResult {
  submission: AnalysisSubmission;
  scores: CommentScore[];
}

function axisMax(axis: AxisName, platform: Platform): number {
  return RULES.filter(r => r.axis === axis && r.family !== 'E' && r.platforms.includes(platform)).reduce((t, r) => t + Math.max(...r.points), 0);
}

export function assembleAnalysis(input: AssembleInput): AssembleResult {
  const { graph, triage } = input;
  const index = new GraphIndex(graph);
  const platform = graph.platform;
  const jobs = input.enrichments.filter(j => j.status === 'completed');
  const results = historyResults(jobs);
  const resultByAuthor = new Map(results.map(r => [r.authorId, r]));
  const known = knownEvidenceIds(graph, jobs);
  const triageById = new Map(triage.comments.filter(c => index.comment(c.commentId)).map(c => [c.commentId, c]));
  const limitations: string[] = [];
  const who = (authorId: string | null) => {
    const h = index.handle(authorId);
    if (!h) return 'an unknown author';
    return platform === 'reddit' ? `u/${h}` : platform === 'x' ? `@${h}` : h;
  };
  const handle = (commentId: string) => who(index.comment(commentId)?.authorId ?? null);

  // --- Rubric scores for each target comment -------------------------------------------
  // All recommendations count for the thread; at most MAX_SCORING_TARGETS were sent for rubric scoring.
  const targets = new Set(index.comments.filter(c => triageById.get(c.id)?.recommendsProduct).map(c => c.id));
  const sentForScoring = new Set(scoringTargets(index, triage));
  const proposals = new Map((input.scoring?.assessments ?? []).filter(p => targets.has(p.commentId)).map(p => [p.commentId, p]));
  const productOf = (id: string) => (triageById.get(id)?.recommendsProduct ?? '').trim().toLowerCase();
  const scores: CommentScore[] = [];
  for (const commentId of targets) {
    const proposal = proposals.get(commentId);
    if (!proposal) continue;
    const comment = index.comment(commentId)!;
    const own = comment.authorId ? resultByAuthor.get(comment.authorId) : undefined;
    const coAuthors = unique(
      index.comments
        .filter(c => c.id !== commentId && c.authorId && c.authorId !== comment.authorId && productOf(c.id) === productOf(commentId))
        .map(c => c.authorId as string),
    );
    const availability: EvidenceAvailability = {
      platform,
      authorHistoryCount: own?.comments.length ?? 0,
      authorHistoryPartial: own?.status === 'partial',
      authorHasProfile: !!(own?.profile ?? (comment.authorId ? index.authors.get(comment.authorId)?.profile : undefined)),
      coRecommenderHistoryCounts: coAuthors.map(a => resultByAuthor.get(a)?.comments.length ?? 0),
      rootAuthorHistoryCount: index.root.authorId && index.root.authorId !== comment.authorId ? resultByAuthor.get(index.root.authorId)?.comments.length ?? 0 : 0,
      anyUsedHistoryPartial: [comment.authorId, index.root.authorId, ...coAuthors].some(a => a && resultByAuthor.get(a)?.status === 'partial'),
    };
    scores.push(scoreComment(proposal, availability, known));
  }
  const missingProposals = Array.from(sentForScoring).filter(id => !proposals.has(id));
  if (input.scoring && missingProposals.length) limitations.push(`${missingProposals.length} recommendation comment(s) were not scored by the model and were left out of the rubric results.`);
  if (targets.size > sentForScoring.size) limitations.push(`${sentForScoring.size} of ${targets.size} recommendations were scored with the rubric (flagged and most detailed first).`);
  const discarded = scores.reduce((t, s) => t + s.discarded.length, 0);
  if (discarded) limitations.push(`${discarded} model-proposed rubric signal(s) were discarded because the platform, available evidence or cited IDs did not support them.`);
  const scored = scores.filter(s => s.score !== null);
  const scoreById = new Map(scores.map(s => [s.commentId, s]));

  // --- Axes ----------------------------------------------------------------------------------
  const thread = threadSignals(index, triage);
  // Measured thread signals stand in for an axis when they show more than the rubric did.
  const measuredAxis = (axis: AxisName): { score: number; refs: string[]; explanation: string } | null => {
    if (axis === 'promotional_intent' && thread.promotion.score > 0) {
      // Promotional language only; shop-style names are their own finding on the website.
      const parts = [
        thread.templates.length ? `${thread.templates.length} comment(s) use seller or template phrases` : '',
        thread.outreach.length ? `${thread.outreach.length} comment(s) fish for the store owner` : '',
      ].filter(Boolean);
      return { score: thread.promotion.score, refs: thread.promotion.refs, explanation: `${AXIS_LABEL[axis]}: measured in the thread: ${parts.join('; ')}.` };
    }
    if (axis === 'semantic_coordination' && thread.duplicates) {
      return { score: thread.duplication.score, refs: thread.duplication.refs, explanation: `${AXIS_LABEL[axis]}: ${thread.repeated.supportive} supportive comments repeat another account's short text (${thread.repeated.groups.slice(0, 4).map(g => `"${g.text}" ×${g.authors}`).join(', ')}).` };
    }
    return null;
  };
  const rubricAxes: AxisAssessment[] = AXES.map(axis => {
    if (axis === 'disclosure_concerns') {
      const disclosed = scores.filter(s => s.label === 'disclosed_promotion');
      return {
        axis,
        score: null,
        confidence: null,
        assessedCommentCount: scored.length,
        explanation: disclosed.length
          ? `Not scored: the rubric cannot measure undisclosed sponsorship directly. ${disclosed.length} recommendation(s) disclosed a commercial tie and were capped as disclosed promotion.`
          : 'Not scored: the rubric cannot measure undisclosed sponsorship directly. No recommendation disclosed a commercial tie.',
        evidenceRefs: unique(disclosed.flatMap(s => s.exculpatory.filter(e => e.id === 'E1').flatMap(e => e.evidenceRefs))),
      };
    }
    const max = axisMax(axis, platform);
    const axisRules = RULES.filter(r => r.axis === axis && r.family !== 'E' && r.platforms.includes(platform));
    let best: { index: number; s: CommentScore } | null = null;
    let assessed = 0;
    for (const s of scored) {
      const evaluable = axisRules.some(r => !s.unknown.includes(r.id) || s.signals.some(x => x.id === r.id));
      if (!evaluable || max === 0) continue;
      assessed++;
      const points = s.signals.filter(x => RULES_BY_ID.get(x.id)?.axis === axis).reduce((t, x) => t + x.points, 0);
      const idx = Math.min(100, Math.round((100 * points) / max));
      if (!best || idx > best.index || (idx === best.index && CONFIDENCE_VALUE[s.confidence] > CONFIDENCE_VALUE[best.s.confidence])) best = { index: idx, s };
    }
    if (!best) {
      return {
        axis,
        score: null,
        confidence: null,
        assessedCommentCount: 0,
        explanation: `${AXIS_LABEL[axis]}: not assessed; no evaluable rubric rules or no scored recommendations.`,
        evidenceRefs: [],
      };
    }
    const fired = best.s.signals.filter(x => RULES_BY_ID.get(x.id)?.axis === axis);
    return {
      axis,
      score: best.index,
      confidence: CONFIDENCE_VALUE[best.s.confidence],
      assessedCommentCount: assessed,
      explanation: fired.length
        ? `${AXIS_LABEL[axis]}: highest for the recommendation by ${handle(best.s.commentId)}. ${fired.map(f => `${f.id}: ${f.evidence}`).join(' ')} Index = share of this axis's rubric points that fired.`
        : `${AXIS_LABEL[axis]}: assessed ${assessed} recommendation(s); no rubric signals on this axis fired.`,
      evidenceRefs: unique(fired.flatMap(f => f.evidenceRefs)),
    };
  });

  const axes: AxisAssessment[] = rubricAxes.map(a => {
    const m = measuredAxis(a.axis);
    if (!m || m.score <= (a.score ?? -1)) return a;
    return { axis: a.axis, score: m.score, confidence: 0.3, assessedCommentCount: Math.max(a.assessedCommentCount, m.refs.length), explanation: m.explanation, evidenceRefs: unique(m.refs.filter(r => known.has(r))) };
  });

  // --- Per-comment assessments and sentiment -------------------------------------------------------
  const analyzed = input.analyzedCommentIds.filter(id => index.comment(id));
  const counts: Record<Stance, number> = { supportive: 0, critical: 0, neutral: 0, mixed: 0, unclear: 0 };
  let unclassified = 0;
  const promoMax = axisMax('promotional_intent', platform);
  const commentAssessments: CommentAssessment[] = analyzed.map(commentId => {
    const t = triageById.get(commentId);
    if (!t) unclassified++;
    const stance: Stance = t?.stance ?? 'unclear';
    counts[stance]++;
    const s = scoreById.get(commentId);
    if (s && s.score !== null) {
      const promoPoints = s.signals.filter(x => RULES_BY_ID.get(x.id)?.axis === 'promotional_intent').reduce((n, x) => n + x.points, 0);
      const fmt = (x: { id: string; points: number; evidence: string }) => `${x.id} ${x.points > 0 ? '+' : ''}${x.points}: ${x.evidence}`;
      const parts = [
        safeText(s.summary, `Recommendation of ${s.product ?? 'a product'} assessed with the rubric.`),
        `Rubric ${s.score}/100 (${s.tier}; ${s.confidence.toLowerCase()} evidence confidence).`,
        s.signals.length ? `Signals: ${s.signals.map(fmt).join(' ')}` : 'No rubric signals fired.',
        s.exculpatory.length ? `Exculpatory: ${s.exculpatory.map(fmt).join(' ')}` : '',
        s.capsApplied.length ? `Caps applied: ${s.capsApplied.join(', ')}.` : '',
        s.unknown.length ? `Unknown for lack of data: ${s.unknown.join(', ')}.` : '',
      ];
      return {
        commentId,
        stance,
        promotionalIntentScore: promoMax ? Math.min(100, Math.round((100 * promoPoints) / promoMax)) : null,
        rationale: parts.filter(Boolean).join(' '),
        evidenceRefs: unique([commentId, ...s.signals.flatMap(x => x.evidenceRefs), ...s.exculpatory.flatMap(x => x.evidenceRefs)]),
      };
    }
    return {
      commentId,
      stance,
      promotionalIntentScore: null,
      rationale: safeText(t?.rationale ?? '', t ? 'Classified for stance only.' : 'Not classified by the model.'),
      evidenceRefs: [commentId],
    };
  });

  // --- Per-comment astroturfing estimate (realism, username, phrases, duplicates, rubric) -------
  const templateBy = new Map(thread.templates.map(t => [t.commentId, t.label]));
  const outreachSet = new Set(thread.outreach);
  const duplicateSet = new Set(thread.duplicates ? thread.repeated.commentIds : []);
  const fillerSet = new Set(thread.lowEffort.filler);
  const estimates: { score: number; endorses: boolean }[] = [];
  for (const assessment of commentAssessments) {
    const c = index.comment(assessment.commentId);
    const t = triageById.get(assessment.commentId);
    if (!c || !c.text.trim()) continue;
    const endorses = !!t && (t.stance === 'supportive' || t.recommendsSubject || !!t.recommendsProduct);
    const estimate = commentEstimate({
      realism: t?.realism,
      handle: index.handle(c.authorId),
      endorses,
      template: templateBy.get(c.id) ?? null,
      outreach: outreachSet.has(c.id),
      duplicate: duplicateSet.has(c.id),
      filler: fillerSet.has(c.id),
      rubricScore: scoreById.get(c.id)?.score ?? null,
    });
    assessment.astroturfEstimate = estimate;
    estimates.push({ score: estimate.score, endorses });
  }

  // --- Account automation signals for each sampled user with history ---------------------------
  const sample = sampleHistoryAuthors(graph, triage);
  const mentionTerms = unique([
    ...(['product', 'brand', 'service'].includes(triage.subject.kind) ? [triage.subject.label] : []),
    ...triage.comments.map(c => c.recommendsProduct ?? ''),
  ].map(t => t.trim()).filter(Boolean));
  const accountProposals = new Map((input.accountReviews ?? input.scoring?.accounts ?? []).map(a => [a.authorId, a]));
  const assessmentById = new Map(commentAssessments.map(c => [c.commentId, c]));
  for (const pair of sample.pairs) {
    const r = resultByAuthor.get(pair.authorId);
    if (!r || r.comments.length === 0) continue;
    // Attach to the anchor comment, or to any analyzed comment by the same author.
    const target = assessmentById.get(pair.anchorCommentId) ?? commentAssessments.find(c => index.comment(c.commentId)?.authorId === pair.authorId);
    if (!target) continue;
    const profile = r.profile ?? index.authors.get(pair.authorId)?.profile;
    const account = scoreAccount(accountProposals.get(pair.authorId), {
      authorId: pair.authorId,
      platform,
      historyCount: r.comments.length,
      historyPartial: r.status === 'partial',
      productMentionIds: r.comments.filter(c => mentionTerms.some(t => mentions(c.text, t)) && known.has(c.id)).map(c => c.id),
      hasProductContext: mentionTerms.length > 0,
      accountAgeDays: daysBetween(profile?.accountCreatedAt, index.comment(pair.anchorCommentId)?.createdAt ?? null),
      anchorCommentId: target.commentId,
      communityCount: new Set(r.comments.map(c => communityFromUrl(c.url)).filter(Boolean)).size,
      historyIds: r.comments.map(c => c.id),
    }, known);
    target.accountSignals = {
      authorId: account.authorId,
      score: account.score,
      historyCount: account.historyCount,
      signals: account.signals.map(x => ({ ruleId: x.id, points: x.points, evidence: safeText(x.evidence, 'A pattern was observed in the sampled history.'), evidenceRefs: x.evidenceRefs })),
      ...(account.humanSignals.length ? { humanSignals: account.humanSignals.map(x => ({ ruleId: x.id, evidence: safeText(x.evidence, 'Ordinary participation was observed in the sampled history.'), evidenceRefs: x.evidenceRefs })) } : {}),
      unknown: account.unknown,
    };
  }
  if (unclassified) limitations.push(`${unclassified} analyzed comment(s) were not classified by the model and are counted as unclear.`);
  const census = analyzed.length === graph.coverage.retrievedCommentCount;
  const sentimentLimitations = [
    'Counts describe analyzed comments, not unique people.',
    ...(census ? [] : [`Only ${analyzed.length} of ${graph.coverage.retrievedCommentCount} retrieved comments fit in the analysis packet.`]),
    ...(graph.coverage.completeness === 'complete' ? [] : ['The retrieved comments may not be every comment in the discussion.']),
  ];

  // --- Clusters and inferred edges ---------------------------------------------------------------
  const cMax = RULES.filter(r => r.family === 'C' && r.platforms.includes(platform)).reduce((t, r) => t + Math.max(...r.points), 0);
  const clusters: ClusterAssessment[] = [];
  for (const proposal of input.scoring?.clusters ?? []) {
    const members = unique(proposal.commentIds.filter(id => targets.has(id)));
    const memberScores = members.map(id => scoreById.get(id)).filter((s): s is CommentScore => !!s && s.score !== null);
    const cPoints = Math.max(0, ...memberScores.map(s => s.signals.filter(x => x.family === 'C').reduce((t, x) => t + x.points, 0)));
    if (members.length < 2 || cPoints === 0) continue;
    const firedIds = unique(memberScores.flatMap(s => s.signals.filter(x => x.family === 'C').map(x => x.id)));
    clusters.push({
      clusterId: `cluster_${clusters.length + 1}`,
      commentIds: members,
      coordinationScore: Math.min(100, Math.round((100 * cPoints) / cMax)),
      explanation: `${safeText(proposal.explanation, 'These recommendations share coordination signals.')} Linked by rubric rules ${firedIds.join(', ')}.`,
      evidenceRefs: unique([...members, ...proposal.evidenceRefs.filter(r => known.has(r))]),
    });
  }

  const edges = new Map<string, InferredEdge>();
  const recs = index.comments.filter(c => targets.has(c.id));
  for (let i = 0; i < recs.length; i++) {
    for (let j = i + 1; j < recs.length; j++) {
      const overlap = round2(wordJaccard(recs[i].text, recs[j].text));
      if (overlap < 0.3) continue;
      edges.set(`${recs[i].id}|${recs[j].id}|S`, {
        from: recs[i].id,
        to: recs[j].id,
        type: 'SEMANTICALLY_SIMILAR',
        strength: overlap,
        explanation: `The two recommendations share ${Math.round(overlap * 100)}% of their content words (deterministic word-overlap measure).`,
        evidenceRefs: [recs[i].id, recs[j].id],
      });
    }
  }
  for (const cluster of clusters) {
    const members = cluster.commentIds.slice().sort();
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        edges.set(`${members[i]}|${members[j]}|C`, {
          from: members[i],
          to: members[j],
          type: 'POTENTIALLY_COORDINATED',
          strength: round2((cluster.coordinationScore ?? 0) / 100),
          explanation: `Both comments are in ${cluster.clusterId}.`,
          evidenceRefs: [members[i], members[j]],
        });
      }
    }
  }

  // --- Overall comment-section index -------------------------------------------------------------
  const { score: overallCoordinationRisk } = sectionIndex({
    index,
    mentionTerms,
    scored,
    noRecommendations: targets.size === 0,
    clusters,
    thread,
    estimates,
    results,
    sample,
    counts,
    analyzedCount: analyzed.length,
    fullCoverage: census && graph.coverage.completeness === 'complete',
    known,
    handle,
  });

  // --- Limitations --------------------------------------------------------------------------------
  if (input.enrichmentNote) limitations.push(input.enrichmentNote);
  if (sample.pairs.length) {
    limitations.push(
      `Account histories were requested for a seeded random sample of users, not everyone: ${sample.supportive.sampled.length} of ${sample.supportive.population} supportive and ${sample.unsupportive.sampled.length} of ${sample.unsupportive.population} unsupportive users${sample.rootAuthorIncluded ? ', plus the post author' : ''}. Rules that need an unsampled user's history are unknown.`,
    );
  }
  // One summary line for the sampled users' history outcomes.
  const relevantAuthors = new Set(sample.pairs.map(p => p.authorId));
  const sampledResults = results.filter(r => relevantAuthors.has(r.authorId));
  const gaps = sampledResults.filter(r => r.status !== 'complete');
  if (gaps.length) {
    const byStatus = new Map<string, number>();
    for (const r of gaps) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
    limitations.push(`${sampledResults.length - gaps.length} of ${sampledResults.length} sampled users returned a full history (${Array.from(byStatus, ([k, n]) => `${n} ${k}`).join(', ')}).`);
  }

  if (!hasAccountHistory(platform)) limitations.push('This platform does not give access to commenters’ histories. Missing history counts neither for nor against astroturfing: history-based checks are left out of every score, and confidence is low.');
  if (index.root.authorId && !results.some(r => r.authorId === index.root.authorId)) limitations.push('The root author’s history was not available, so seeding checks that need it (T2, C5) are unknown.');
  limitations.push(...graph.coverage.limitations);

  const subjectRefs = triage.subject.evidenceRefs.filter(r => known.has(r));
  const submission: AnalysisSubmission = {
    schemaVersion: SCHEMA_VERSION,
    graphRevision: graph.graphRevision,
    graphFingerprint: graph.graphFingerprint,
    inferenceVersion: input.modelLabel ? `${INFERENCE_VERSION}; ${input.modelLabel}` : INFERENCE_VERSION,
    inferredAt: input.inferredAt ?? utcNow(),
    subject: {
      label: triage.subject.label,
      kind: triage.subject.kind,
      confidence: round2(triage.subject.confidence),
      evidenceRefs: subjectRefs.length ? subjectRefs : [graph.rootId],
    },
    sentiment: {
      population: census ? 'retrieved_comments' : 'analyzed_sample',
      method: census ? 'census_of_retrieved' : 'nonprobability_sample',
      analyzedCommentCount: analyzed.length,
      counts,
      weighted: false,
      limitations: sentimentLimitations,
    },
    overallCoordinationRisk,
    axes,
    commentAssessments,
    clusters,
    inferredEdges: Array.from(edges.values()).slice(0, 200),
    usedEnrichmentIds: jobs.map(j => j.enrichmentId),
    limitations: unique(limitations),
  };
  return { submission, scores };
}
