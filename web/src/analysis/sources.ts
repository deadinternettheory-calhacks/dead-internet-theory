// Research behind each signal, from the rubric's sources
// (rubrics/product-astroturfing.md, section 5 and "Sources") with full
// references from the team's literature review. Mapping follows the rubric's
// rule-to-axis mapping in inference/README.md.
import type { AxisName } from '../api/contract';

export interface Source { label: string; title: string; url: string | null }

const S = {
  kumar2017: { label: 'Kumar et al. 2017', title: 'An Army of Me: Sockpuppets in Online Discussion Communities (WWW)', url: null },
  weerasinghe2022: { label: 'Weerasinghe et al. 2022', title: 'Using Authorship Verification to Mitigate Abuse in Online Communities (ICWSM)', url: 'https://par.nsf.gov//servlets/purl/10377975' },
  iannucci2025: { label: 'Iannucci et al. 2025', title: 'Detecting Coordinated Activities Through Temporal, Multiplex, and Collaborative Analysis', url: 'https://arxiv.org/abs/2512.19677v1' },
  miller2016: { label: 'Miller 2016', title: 'Automated Detection of Chinese Government Astroturfers Using Network and Social Metadata', url: 'https://mediawell.ssrc.org/citations/automated-detection-of-chinese-government-astroturfers-using-network-and-social-metadata/' },
  saeed2022: { label: 'Saeed et al. 2022', title: 'TrollMagnifier: Detecting State-Sponsored Troll Accounts on Reddit (IEEE S&P)', url: 'https://arxiv.org/abs/2112.00443' },
  weber: { label: 'Weber & Neumann', title: 'Who’s in the Gang? Revealing Coordinating Communities in Social Media', url: 'https://arxiv.org/abs/2010.08180' },
  pilaud2025: { label: 'Pilaud & McCulloh 2025', title: 'Cross-Subreddit Behavior as Open-Source Indicators of Coordinated Influence', url: 'https://arxiv.org/abs/2507.16857' },
  trokhymovych2026: { label: 'Trokhymovych et al. 2026', title: 'Adversarial Creation and Detection of AI-Generated Social Bot Content', url: 'https://arxiv.org/abs/2606.07219' },
  schneider2026: { label: 'Schneider, Yuan & Rizoiu 2026', title: 'Beyond Content: Behavioral Policies Reveal Actors in Information Operations (npj Complexity)', url: 'https://arxiv.org/abs/2602.02838' },
} satisfies Record<string, Source>;

export const SIGNAL_SOURCES: Record<AxisName, Source[]> = {
  semantic_coordination: [S.kumar2017, S.weerasinghe2022],
  temporal_coordination: [S.iannucci2025, S.miller2016],
  engagement_anomalies: [S.saeed2022, S.weber],
  account_anomalies: [S.pilaud2025, S.saeed2022, S.trokhymovych2026],
  promotional_intent: [S.schneider2026, S.pilaud2025],
  disclosure_concerns: [],
};

/** Short names and research for the account (family B) rules. */
export const ACCOUNT_RULES: Record<string, { label: string; sources: Source[] }> = {
  B1: { label: 'Brand focus', sources: [S.schneider2026] },
  B2: { label: 'Same recommendation elsewhere', sources: [S.kumar2017] },
  B3: { label: 'Engagement farming', sources: [S.pilaud2025] },
  B4: { label: 'New or reactivated account', sources: [S.pilaud2025] },
  B5: { label: 'Style shift', sources: [S.weerasinghe2022] },
  B6: { label: 'Shift-like schedule', sources: [S.miller2016] },
  B7: { label: 'One-sided brand sentiment', sources: [S.pilaud2025] },
  B8: { label: 'LLM-style writing', sources: [S.trokhymovych2026] },
  B9: { label: 'Hidden history', sources: [] },
};

/** Behind the section score's history comparison (brand focus in posting history). */
export const HISTORY_CONTRAST_SOURCES: Source[] = [S.schneider2026, S.pilaud2025];
