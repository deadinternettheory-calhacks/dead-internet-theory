import type { RefObject } from 'react';
import type { ProgressPhase } from '../AnalysisProgress';
import type { GlobeMotion } from '../GraveyardGlobe/globe-motion';

/** Formations follow real backend phases, never an animation timer. */
export function formationFor(phase: ProgressPhase) {
  return phase === 'collecting' ? 'gather' : phase === 'analyzing' ? 'inspect' : 'rest';
}

export interface PlaygroundSceneProps {
  animate: boolean;
  phase: ProgressPhase;
  pulse: number;
  pointer: RefObject<{ x: number; y: number }>;
  motion: RefObject<GlobeMotion>;
  onReady: (invalidate: () => void) => void;
  onFailure: () => void;
}
