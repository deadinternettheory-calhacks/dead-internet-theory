import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { BoxGeometry, CircleGeometry, ExtrudeGeometry, MathUtils, MeshBasicMaterial, MeshStandardMaterial, Shape, type Group, type Mesh } from 'three';
import { commentFlight } from './playground-motion';
import type { PlaygroundSceneProps } from './playground-types';

type Props = Pick<PlaygroundSceneProps, 'animate' | 'phase' | 'onReady' | 'onFailure'>;
const COUNT = 18;

function commentShape() {
  const s = new Shape();
  s.moveTo(-0.26, -0.18);
  s.lineTo(-0.22, -0.18); s.lineTo(-0.22, -0.28); s.lineTo(-0.10, -0.18);
  s.lineTo(0.26, -0.18); s.quadraticCurveTo(0.32, -0.18, 0.32, -0.12);
  s.lineTo(0.32, 0.16); s.quadraticCurveTo(0.32, 0.22, 0.26, 0.22);
  s.lineTo(-0.26, 0.22); s.quadraticCurveTo(-0.32, 0.22, -0.32, 0.16);
  s.lineTo(-0.32, -0.12); s.quadraticCurveTo(-0.32, -0.18, -0.26, -0.18);
  return s;
}

function Comments({ animate, phase, onReady }: Omit<Props, 'onFailure'>) {
  const { invalidate } = useThree();
  const cards = useRef<Group[]>([]);
  const time = useRef(0), phaseAge = useRef(0), lastPhase = useRef(phase);
  const first = useRef(true), initialized = useRef(false);
  const resources = useMemo(() => ({
    card: new ExtrudeGeometry(commentShape(), { depth: 0.065, bevelEnabled: true, bevelSize: 0.018, bevelThickness: 0.018, bevelSegments: 2, steps: 1, curveSegments: 8 }).translate(0, 0, -0.033),
    box: new BoxGeometry(1, 1, 1), circle: new CircleGeometry(0.055, 20),
    paper: new MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.36, metalness: 0.08 }),
    green: new MeshStandardMaterial({ color: '#9BB5A7', roughness: 0.4, metalness: 0.12 }),
    ink: new MeshBasicMaterial({ color: '#A8BFB0' }),
    lightInk: new MeshBasicMaterial({ color: '#EAF1ED' }),
    trim: new MeshStandardMaterial({ color: '#D4DFD5', metalness: 0.4, roughness: 0.35 }),
    sage: new MeshStandardMaterial({ color: '#E2EAE3', roughness: 0.45 }),
    gold: new MeshStandardMaterial({ color: '#C5A980', metalness: 0.45, roughness: 0.3 }),
  }), []);
  useEffect(() => () => Object.values(resources).forEach(r => r.dispose()), [resources]);
  useEffect(() => { invalidate(); }, [phase, animate, invalidate]);
  useFrame((state, delta) => {
    if (first.current) { first.current = false; onReady(state.invalidate); }
    const changed = lastPhase.current !== phase, dt = Math.min(delta, 0.05);
    if (changed) phaseAge.current = 0;
    if (animate) { time.current += dt; phaseAge.current += dt; }
    if (!animate && initialized.current && !changed) return;
    initialized.current = true; lastPhase.current = phase;
    const t = time.current, { width, height } = state.viewport;
    for (let i = 0; i < COUNT; i++) {
      const card = cards.current[i];
      if (!card) continue;
      const { x, y, z, arrival, scan } = commentFlight({ phase, age: phaseAge.current, time: t, index: i, count: COUNT, width, height });
      const angle = i / COUNT * Math.PI * 2 + t * 0.035;
      card.visible = arrival > 0.001;
      (card.children[0] as Mesh).material = scan > 0.6 ? resources.gold : i % 4 === 0 ? resources.green : resources.paper;
      const floatY = y + Math.sin(t + i) * 0.08;
      if (animate && t > 0.05) card.position.set(MathUtils.damp(card.position.x, x, 4.5, dt), MathUtils.damp(card.position.y, floatY, 4.5, dt), MathUtils.damp(card.position.z, z, 4.5, dt));
      else card.position.set(x, floatY, z);
      card.rotation.set(Math.sin(t * 0.45 + i) * 0.08, phase === 'analyzing' ? 0 : Math.sin(angle) * 0.35, Math.sin(i * 2 + t * 0.2) * (phase === 'analyzing' ? 0.04 : 0.2));
      card.scale.setScalar((width < 7 ? 0.75 : 1) * (1 + (i % 3) * 0.10 + scan * 0.22) * arrival);
    }
  });
  return <group name="foreground-comments" dispose={null}>
      {Array.from({ length: COUNT }, (_,i) => <group key={i} name={`illustrative-comment-${i}`} ref={g => { if (g) cards.current[i] = g; }}>
        <mesh geometry={resources.card} material={i % 4 === 0 ? resources.green : resources.paper}/>
        <group>
          <mesh geometry={resources.circle} material={i % 4 === 0 ? resources.lightInk : i % 5 === 0 ? resources.gold : resources.ink} position={[-0.20, 0.085, 0.065]}/>
          <mesh geometry={resources.box} material={i % 4 === 0 ? resources.lightInk : resources.ink} position={[0.055, 0.1, 0.065]} scale={[0.28, 0.03, 0.012]}/>
          <mesh geometry={resources.box} material={i % 4 === 0 ? resources.sage : resources.trim} position={[0.015, 0.025, 0.065]} scale={[0.20, 0.025, 0.012]}/>
          <mesh geometry={resources.box} material={i % 4 === 0 ? resources.sage : resources.trim} position={[0, -0.085, 0.065]} scale={[0.43, 0.025, 0.012]}/>
        </group>
      </group>)}
  </group>;
}

/** Decorative foreground layer; DOM pointer events pass through to the report. */
export default function CommentScene(props: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    element?.addEventListener('webglcontextlost', props.onFailure);
    return () => element?.removeEventListener('webglcontextlost', props.onFailure);
  }, [props.onFailure]);
  return <Canvas ref={canvas} className="comment-canvas" aria-hidden="true" orthographic camera={{ position: [0, 0, 20], zoom: 80 }}
    dpr={1} frameloop={props.animate ? 'always' : 'demand'} gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}>
    <ambientLight intensity={1.15}/><directionalLight position={[-3, 5, 5]} intensity={2.5}/><directionalLight position={[4, -2, -3]} intensity={1.2} color="#EAF1ED"/>
    <Comments {...props}/>
  </Canvas>;
}
