import { describe, expect, it } from 'vitest';
import type { GraphEnvelope } from '../convex/lib/contract';
import type { TriageOutput } from '../convex/lib/inference/outputs';
import { GraphIndex } from '../convex/lib/inference/packet';
import { commentEstimate, handleKind, threadSignals } from '../convex/lib/inference/signals';

/** A synthetic product-video thread: seller accounts, a template phrase, outreach and copied praise. */
function videoThread(): { graph: GraphEnvelope; triage: TriageOutput } {
  const rows: [string, string, TriageOutput['comments'][number]['stance']][] = [
    ['besthomeco', 'A total lifesaver for travel! Erases wrinkles in seconds', 'supportive'],
    ['guangzhou.sourcing', 'This winning product changed my momentum', 'supportive'],
    ['sparknest_home', 'This thing is good.', 'supportive'],
    ['anna_r', 'good', 'supportive'],
    ['mike77', 'Good', 'supportive'],
    ['user8661746914582', 'good!', 'supportive'],
    ['wkkvdqwsunsg4p', 'good', 'supportive'],
    ['jo.bakes', 'How much?', 'neutral'],
    ['shuksysolutions', 'Is this the right account to reach out to the store owner?', 'neutral'],
    ['realperson', 'Mine leaked after two uses.', 'critical'],
  ];
  const nodes: GraphEnvelope['nodes'] = [{ id: 'tiktok:discussion:v', type: 'discussion', platform: 'tiktok', kind: 'video', url: 'https://www.tiktok.com/@x/video/1', text: 'Mini steam iron', authorId: null, createdAt: null, metrics: {} } as never];
  const comments: TriageOutput['comments'] = [];
  rows.forEach(([handle, text, stance], i) => {
    nodes.push({ id: `tiktok:author:${i}`, type: 'author', handle, displayName: null } as never);
    nodes.push({ id: `tiktok:comment:${i}`, type: 'comment', authorId: `tiktok:author:${i}`, parentId: 'tiktok:discussion:v', text, createdAt: null, url: null, metrics: {}, contentStatus: 'visible' } as never);
    comments.push({ commentId: `tiktok:comment:${i}`, stance, recommendsProduct: stance === 'supportive' ? 'Mini steam iron' : null, recommendsSubject: stance === 'supportive', rationale: '', realism: i < 2 ? 'unnatural' : i < 7 ? 'generic' : 'natural' });
  });
  const graph = { investigationId: 'inv_v', platform: 'tiktok', rootId: 'tiktok:discussion:v', nodes, edges: [], coverage: { retrievedCommentCount: rows.length, reportedCommentCount: null, completeness: 'complete', limitations: [] } } as unknown as GraphEnvelope;
  return { graph, triage: { subject: { label: 'Mini steam iron', kind: 'product', confidence: 0.8, evidenceRefs: [] }, comments } };
}

describe('username patterns', () => {
  it('tells seller, random, default and normal names apart', () => {
    expect(handleKind('guangzhou.sourcing')).toBe('seller');
    expect(handleKind('besthomeco')).toBe('seller');
    expect(handleKind('yourshoppingbuddyamz')).toBe('seller');
    expect(handleKind('wkkvdqwsunsg4p')).toBe('random');
    expect(handleKind('addxvvaf14996hew')).toBe('random');
    expect(handleKind('user8661746914582')).toBe('default');
    expect(handleKind('jennievillanueva14')).toBe('normal');
    expect(handleKind('lagorfexx')).toBe('normal');
  });
});

describe('thread commercial signals', () => {
  it('finds seller praise, template phrases, outreach and copied praise', () => {
    const { graph, triage } = videoThread();
    const s = threadSignals(new GraphIndex(graph), triage);
    expect(s.sellerPraise.authors).toBe(3);
    expect(s.templates.map(t => t.label)).toEqual(['"lifesaver"', '"winning product"']);
    expect(s.outreach).toEqual(['tiktok:comment:8']);
    expect(s.duplicates).toMatchObject({ text: 'good', authors: 4 });
    expect(s.strength).toBeGreaterThan(0.5);
  });
});

describe('per-comment estimate', () => {
  it('adds realism, username, phrase and duplicate points, and keeps the rubric score when higher', () => {
    const e = commentEstimate({ realism: 'unnatural', handle: 'guangzhou.sourcing', endorses: true, template: '"winning product"', outreach: false, duplicate: false, rubricScore: 8 });
    expect(e.score).toBe(95);
    expect(e.reasons).toEqual(['Unnatural or ad-like text', 'Seller-style username', 'Template phrase "winning product"']);
    expect(commentEstimate({ realism: 'natural', handle: 'anna_r', endorses: true, template: null, outreach: false, duplicate: false, rubricScore: 76 })).toEqual({ score: 76, reasons: ['Rubric 76/100'] });
  });

  it('does not score a real-looking critic or a plain question', () => {
    expect(commentEstimate({ realism: 'natural', handle: 'realperson', endorses: false, template: null, outreach: false, duplicate: false, rubricScore: null }).score).toBe(0);
    // A default username alone, without endorsing anything, is not a signal.
    expect(commentEstimate({ realism: 'natural', handle: 'user123456789', endorses: false, template: null, outreach: false, duplicate: false, rubricScore: null }).score).toBe(0);
  });
});
