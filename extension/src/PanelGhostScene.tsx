import { useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { GhostCharacter } from '../../web/src/components/AnalysisPlayground/GhostCharacter';
import { createGlobeMotion } from '../../web/src/components/GraveyardGlobe/globe-motion';
import type { PlaygroundPhase } from '../../web/src/components/AnalysisPlayground/playground-types';

export default function PanelGhostScene({ animate, phase, pulse, onFailure }: { animate: boolean; phase: PlaygroundPhase; pulse: number; onFailure: () => void }) {
  const pointer = useRef({ x: 0, y: 0 });
  const motion = useRef(createGlobeMotion());
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    element?.addEventListener('webglcontextlost', onFailure);
    return () => element?.removeEventListener('webglcontextlost', onFailure);
  }, [onFailure]);
  return <Canvas ref={canvas} aria-hidden="true" orthographic camera={{ position: [0, 0, 20], zoom: 70 }} dpr={[1, 1.25]} frameloop={animate ? 'always' : 'demand'} gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}>
    <ambientLight intensity={1.15}/><directionalLight position={[-3, 5, 5]} intensity={2.5}/>
    <GhostCharacter animate={animate} phase={phase} pulse={pulse} pointer={pointer} motion={motion} roaming={false}/>
  </Canvas>;
}
