import type { RefObject } from 'react';
import type { ProgressPhase } from '../AnalysisProgress';
import type { GlobeMotion } from '../GraveyardGlobe/globe-motion';

export const ORBITS = ['Orbit', 'Vortex', 'Wave'] as const;

export interface PlaygroundSceneProps {
  animate: boolean;
  phase: ProgressPhase;
  orbit: number;
  pulse: number;
  pointer: RefObject<{ x: number; y: number }>;
  motion: RefObject<GlobeMotion>;
  onReady: (invalidate: () => void) => void;
  onFailure: () => void;
}
