import { useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { createGlobeMotion } from '../GraveyardGlobe/globe-motion';
import { GhostCharacter } from './GhostCharacter';

export default function IdleGhostScene({ animate }: { animate: boolean }) {
  const pointer = useRef({ x: 0, y: 0 });
  const motion = useRef(createGlobeMotion());
  return <Canvas orthographic camera={{ position: [0, 0, 20], zoom: 110, near: 0.1, far: 100 }}
    dpr={[1, 1.25]} frameloop={animate ? 'always' : 'demand'}
    gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}>
    <ambientLight intensity={1.15}/>
    <directionalLight position={[-3, 5, 5]} intensity={2.5}/>
    <directionalLight position={[4, -2, -3]} intensity={1.2} color="#D4DFD5"/>
    <GhostCharacter idle animate={animate} phase="starting" pulse={0} pointer={pointer} motion={motion}/>
  </Canvas>;
}
