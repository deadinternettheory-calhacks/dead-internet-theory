import type { RefObject } from 'react';
import type { ProgressPhase } from '../AnalysisProgress';
import type { GlobeMotion } from '../GraveyardGlobe/globe-motion';

/** Formations follow live backend phases or the labeled saved-result presentation. */
export type PlaygroundPhase = ProgressPhase | 'complete' | 'failed';

export function formationFor(phase: PlaygroundPhase) {
  return phase === 'complete' ? 'celebrate' : phase === 'collecting' ? 'gather' : phase === 'analyzing' ? 'inspect' : 'rest';
}

export interface PlaygroundSceneProps {
  animate: boolean;
  phase: PlaygroundPhase;
  pulse: number;
  pointer: RefObject<{ x: number; y: number }>;
  motion: RefObject<GlobeMotion>;
  onReady: (invalidate: () => void) => void;
  onFailure: () => void;
}
