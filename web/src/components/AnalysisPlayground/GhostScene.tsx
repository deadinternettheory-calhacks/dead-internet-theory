import { useEffect, useRef, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { GhostCharacter } from './GhostCharacter';
import { ghostTravel } from './playground-motion';
import type { PlaygroundSceneProps } from './playground-types';

function Flight({ overlay, ...props }: PlaygroundSceneProps & { overlay: RefObject<HTMLDivElement | null> }) {
  const { invalidate } = useThree();
  const time = useRef(0);
  const first = useRef(true);
  useEffect(() => {
    // The small canvas has a fixed size; the flight bounds follow the browser.
    const onResize = () => invalidate();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [invalidate]);
  useFrame((state, delta) => {
    if (first.current) { first.current = false; props.onReady(state.invalidate); }
    if (props.animate) time.current += Math.min(delta, 0.05);
    const p = ghostTravel(time.current, window.innerWidth / 80, window.innerHeight / 80);
    if (overlay.current) overlay.current.style.transform = `translate3d(${p.x * 80}px, ${-p.y * 80}px, 0)`;
  });
  return <GhostCharacter {...props} roaming={false}/>;
}

/** A small transparent renderer above the document; it never intercepts page controls. */
export default function GhostScene(props: PlaygroundSceneProps & { overlay: RefObject<HTMLDivElement | null> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    element?.addEventListener('webglcontextlost', props.onFailure);
    return () => element?.removeEventListener('webglcontextlost', props.onFailure);
  }, [props.onFailure]);
  return <Canvas ref={canvas} className="ghost-canvas" aria-hidden="true" orthographic camera={{ position: [0, 0, 20], zoom: 80 }}
    dpr={[1, 1.25]} frameloop={props.animate ? 'always' : 'demand'} gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}>
    <ambientLight intensity={1.15}/>
    <directionalLight position={[-3, 5, 5]} intensity={2.5}/>
    <directionalLight position={[4, -2, -3]} intensity={1.2} color="#EAF1ED"/>
    <Flight {...props}/>
  </Canvas>;
}
