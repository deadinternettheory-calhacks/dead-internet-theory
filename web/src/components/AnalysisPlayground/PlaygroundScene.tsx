import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  BoxGeometry, CircleGeometry, ExtrudeGeometry, IcosahedronGeometry, LineBasicMaterial,
  MathUtils, MeshBasicMaterial, MeshStandardMaterial, Object3D, Shape, SphereGeometry,
  TorusGeometry, type Group, type InstancedMesh,
} from 'three';
import { createHeadstoneShape, createWireframe, GRAVES } from '../GraveyardGlobe/globe-model';
import { advanceGlobe } from '../GraveyardGlobe/globe-motion';
import type { PlaygroundSceneProps } from './playground-types';

const COUNT = 14;
const SPARKS = 32;
const TAU = Math.PI * 2;
const COLORS = { paper: '#FFFFFF', core: '#EAF1ED', green: '#284D43', sage: '#D4DFD5', ink: '#648575', trim: '#B7CABB', gold: '#A86518' };

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

function ghostShape() {
  const s = new Shape();
  s.moveTo(-0.38, -0.34); s.lineTo(-0.38, 0.14);
  s.absarc(0, 0.14, 0.38, Math.PI, 0, true);
  s.lineTo(0.38, -0.34);
  s.quadraticCurveTo(0.38, -0.46, 0.25, -0.32);
  s.quadraticCurveTo(0.18, -0.25, 0.12, -0.36);
  s.quadraticCurveTo(0, -0.53, -0.12, -0.36);
  s.quadraticCurveTo(-0.18, -0.25, -0.25, -0.32);
  s.quadraticCurveTo(-0.38, -0.46, -0.38, -0.34);
  return s;
}

function Model({ animate, phase, orbit, pulse, pointer, motion, onReady }: Omit<PlaygroundSceneProps, 'onFailure'>) {
  const { invalidate } = useThree();
  const world = useRef<Group>(null);
  const tilt = useRef<Group>(null);
  const core = useRef<Group>(null);
  const halo = useRef<Group>(null);
  const ghost = useRef<Group>(null);
  const eyes = useRef<Group>(null);
  const cards = useRef<Group[]>([]);
  const ripples = useRef<Group[]>([]);
  const sparks = useRef<InstancedMesh>(null);
  const time = useRef(0);
  const pulseAge = useRef(3);
  const first = useRef(true);
  const initialized = useRef(false);
  const lastOrbit = useRef(orbit);
  const stamp = useMemo(() => new Object3D(), []);
  const resources = useMemo(() => ({
    wire: createWireframe(),
    sphere: new SphereGeometry(1.44, 36, 24),
    stone: new ExtrudeGeometry(createHeadstoneShape(), { depth: 0.09, bevelEnabled: true, bevelSize: 0.016, bevelThickness: 0.016, bevelSegments: 2, steps: 1, curveSegments: 10 }).translate(0, 0, -0.045),
    card: new ExtrudeGeometry(commentShape(), { depth: 0.065, bevelEnabled: true, bevelSize: 0.018, bevelThickness: 0.018, bevelSegments: 2, steps: 1, curveSegments: 8 }).translate(0, 0, -0.033),
    ghost: new ExtrudeGeometry(ghostShape(), { depth: 0.34, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.09, bevelSegments: 4, steps: 1, curveSegments: 24 }).translate(0, 0, -0.17),
    eye: new SphereGeometry(1, 16, 12),
    smile: new TorusGeometry(0.095, 0.016, 6, 24, Math.PI),
    box: new BoxGeometry(1, 1, 1),
    circle: new CircleGeometry(0.055, 20),
    ring: new TorusGeometry(1.38, 0.012, 6, 128),
    ripple: new TorusGeometry(1, 0.012, 6, 96),
    spark: new IcosahedronGeometry(0.035, 0),
    paper: new MeshStandardMaterial({ color: COLORS.paper, roughness: 0.36, metalness: 0.08 }),
    green: new MeshStandardMaterial({ color: COLORS.green, roughness: 0.4, metalness: 0.12 }),
    sage: new MeshStandardMaterial({ color: COLORS.sage, roughness: 0.45 }),
    core: new MeshStandardMaterial({ color: COLORS.core, roughness: 0.45, metalness: 0.05 }),
    trim: new MeshStandardMaterial({ color: COLORS.trim, metalness: 0.4, roughness: 0.35 }),
    ink: new MeshBasicMaterial({ color: COLORS.ink }),
    lightInk: new MeshBasicMaterial({ color: COLORS.core }),
    gold: new MeshStandardMaterial({ color: COLORS.gold, metalness: 0.45, roughness: 0.3 }),
    sparkle: new MeshBasicMaterial({ color: COLORS.gold }),
    wireInk: new LineBasicMaterial({ color: COLORS.ink, transparent: true, opacity: 0.45 }),
  }), []);
  const rippleMaterials = useMemo(() => Array.from({ length: 3 }, () => new MeshBasicMaterial({ color: COLORS.green, transparent: true, opacity: 0, depthWrite: false })), []);

  useEffect(() => () => {
    Object.values(resources).forEach(resource => resource.dispose());
    rippleMaterials.forEach(material => material.dispose());
  }, [resources, rippleMaterials]);
  useEffect(() => { pulseAge.current = 0; invalidate(); }, [pulse, phase, invalidate]);
  useEffect(() => { invalidate(); }, [orbit, animate, invalidate]);

  useFrame((state, delta) => {
    if (first.current) { first.current = false; onReady(state.invalidate); }
    if (!world.current || !tilt.current) return;
    const dt = Math.min(delta, 0.05);
    if (animate) { time.current += dt; pulseAge.current += dt; advanceGlobe(motion.current, dt); }
    const t = time.current;
    const age = pulseAge.current;
    const analyzing = phase === 'analyzing';
    const pace = analyzing ? 0.23 : phase === 'collecting' ? 0.16 : 0.08;
    const shock = age < 1.6 ? Math.sin(Math.min(1, age / 1.6) * Math.PI) * Math.exp(-age * 1.5) : 0;
    const fit = Math.min(1, state.viewport.width / 6.5);
    tilt.current.scale.setScalar(fit);
    world.current.rotation.set(motion.current.pitch, motion.current.yaw, 0, 'YXZ');
    // Demand frames can still occur on resize or React commits. A paused scene
    // keeps its exact pose; direct turns and an explicit remix remain available.
    if (!animate && initialized.current && lastOrbit.current === orbit) return;
    initialized.current = true;
    lastOrbit.current = orbit;
    tilt.current.rotation.x = MathUtils.damp(tilt.current.rotation.x, 0.12 + pointer.current.y * 0.10, 4, dt);
    tilt.current.rotation.z = MathUtils.damp(tilt.current.rotation.z, -0.07 - pointer.current.x * 0.08, 4, dt);
    if (core.current) { core.current.rotation.y = t * 0.16; core.current.position.y = Math.sin(t * 0.8) * 0.07; }
    if (halo.current) { halo.current.rotation.y = t * -0.13; halo.current.rotation.z = Math.sin(t * 0.3) * 0.1; }
    if (ghost.current) {
      ghost.current.position.set(Math.sin(t * 0.55) * 0.06, 0.07 + Math.sin(t * 1.4) * 0.13 + shock * 0.3, 1.35);
      ghost.current.rotation.set(pointer.current.y * 0.1, Math.sin(motion.current.yaw) * 0.28, Math.sin(t * 0.7) * 0.06 - pointer.current.x * 0.08);
      ghost.current.scale.set(1.1 + shock * 0.18, 1.1 - shock * 0.10, 1.1);
    }
    if (eyes.current) eyes.current.scale.y = MathUtils.damp(eyes.current.scale.y, t % 5.5 > 5.28 ? 0.12 : 1 + shock * 0.8, 35, dt);
    resources.wireInk.opacity = analyzing ? 0.65 : 0.42;

    for (let i = 0; i < COUNT; i++) {
      const card = cards.current[i];
      if (!card) continue;
      const angle = i / COUNT * TAU + t * pace;
      let x: number, y: number, z: number;
      if (orbit === 1) {
        const a = angle * 1.7;
        x = Math.cos(a) * 1.85; y = (i / (COUNT - 1) - 0.5) * 3.2; z = Math.sin(a) * 1.45;
      } else if (orbit === 2) {
        x = (i - (COUNT - 1) / 2) * 0.38;
        y = Math.sin(i * 0.65 + t * 0.9) * 1.15;
        z = Math.cos(i * 0.65 + t * 0.9) * 0.85;
      } else {
        x = Math.cos(angle) * 2.12; y = Math.sin(angle * 2 + t * 0.35) * 0.8; z = Math.sin(angle) * 1.65;
      }
      const swell = 1 + shock * 0.55;
      const floatY = y * swell + Math.sin(t + i) * 0.08;
      if (animate && t > 0.05) card.position.set(
        MathUtils.damp(card.position.x, x * swell, 4.5, dt),
        MathUtils.damp(card.position.y, floatY, 4.5, dt),
        MathUtils.damp(card.position.z, z * swell, 4.5, dt),
      );
      else card.position.set(x * swell, floatY, z * swell);
      card.rotation.set(Math.sin(t * 0.45 + i) * 0.12, Math.sin(angle) * 0.35, Math.sin(i * 2 + t * 0.2) * 0.2 + shock * (i % 2 ? 0.4 : -0.4));
      card.scale.setScalar(1 + (i % 3) * 0.10 + shock * 0.2);
    }
    for (let i = 0; i < 3; i++) {
      const p = Math.max(0, age - i * 0.13);
      ripples.current[i]?.scale.setScalar(0.85 + p * 2.1);
      rippleMaterials[i].opacity = age > i * 0.13 ? Math.max(0, 0.52 * (1 - p / 1.25)) : 0;
      if (ripples.current[i]) ripples.current[i].visible = rippleMaterials[i].opacity > 0;
    }
    if (sparks.current) {
      sparks.current.visible = age < 1.7;
      for (let i = 0; i < SPARKS && age < 1.7; i++) {
        const y = 1 - (i + 0.5) / SPARKS * 2;
        const r = Math.sqrt(1 - y * y);
        const a = i * 2.39996;
        const spread = 0.8 + Math.min(age, 2) * 1.8;
        stamp.position.set(Math.cos(a) * r * spread, y * spread, Math.sin(a) * r * spread);
        stamp.rotation.set(age + i, age * 2, 0);
        stamp.scale.setScalar(Math.max(0, 1 - age / 1.7));
        stamp.updateMatrix(); sparks.current.setMatrixAt(i, stamp.matrix);
      }
      if (age < 1.7) sparks.current.instanceMatrix.needsUpdate = true;
    }
  });

  return <group ref={tilt} dispose={null} rotation={[0.12, 0, -0.07]}>
    <group ref={world}>
      <group ref={halo}>
        <mesh geometry={resources.ring} material={resources.trim} rotation={[1.1, 0.2, 0.35]}/>
        <mesh geometry={resources.ring} material={resources.gold} rotation={[0.6, 0.65, -0.65]} scale={1.13}/>
      </group>
      <group ref={core} scale={0.65}>
        <mesh geometry={resources.sphere} material={resources.core}/>
        <lineSegments geometry={resources.wire} material={resources.wireInk}/>
        {GRAVES.filter((_,i) => i % 2 === 0).map((grave,i) => <group key={i} position={grave.position} quaternion={grave.quaternion} scale={grave.scale}>
          <mesh geometry={resources.stone} material={i % 3 === 0 ? resources.green : resources.sage}/>
          <mesh geometry={resources.box} material={resources.trim} position={[0, 0.015, 0]} scale={[0.34, 0.045, 0.18]}/>
          <mesh geometry={resources.box} material={i % 3 === 0 ? resources.lightInk : resources.ink} position={[0, 0.21, 0.065]} scale={[0.11, 0.02, 0.012]}/>
        </group>)}
      </group>
      {Array.from({ length: COUNT }, (_,i) => <group key={i} ref={g => { if (g) cards.current[i] = g; }}>
        <mesh geometry={resources.card} material={i % 4 === 0 ? resources.green : resources.paper}/>
        {[1,-1].map(side => <group key={side} rotation={[0, side === -1 ? Math.PI : 0, 0]}>
          <mesh geometry={resources.circle} material={i % 4 === 0 ? resources.lightInk : i % 5 === 0 ? resources.gold : resources.ink} position={[-0.20, 0.085, 0.065]}/>
          <mesh geometry={resources.box} material={i % 4 === 0 ? resources.lightInk : resources.ink} position={[0.055, 0.1, 0.065]} scale={[0.28, 0.03, 0.012]}/>
          <mesh geometry={resources.box} material={i % 4 === 0 ? resources.sage : resources.trim} position={[0.015, 0.025, 0.065]} scale={[0.20, 0.025, 0.012]}/>
          <mesh geometry={resources.box} material={i % 4 === 0 ? resources.sage : resources.trim} position={[0, -0.085, 0.065]} scale={[0.43, 0.025, 0.012]}/>
        </group>)}
      </group>)}
      {rippleMaterials.map((material,i) => <group key={i} ref={g => { if (g) ripples.current[i] = g; }}>
        <mesh geometry={resources.ripple} material={material} rotation={[0.25 + i * 0.55, i * 0.4, i * 0.2]}/>
      </group>)}
      <instancedMesh ref={sparks} args={[resources.spark, resources.sparkle, SPARKS]} frustumCulled={false}/>
    </group>
    <group ref={ghost} position={[0, 0.07, 1.35]} scale={1.1}>
      <mesh geometry={resources.ghost} material={resources.paper}/>
      <group ref={eyes} position={[0, 0.12, 0.25]}>
        {[-0.13,0.13].map(x => <group key={x} position={[x, 0, 0]}>
          <mesh geometry={resources.eye} material={resources.green} scale={[0.052, 0.075, 0.025]}/>
          <mesh geometry={resources.eye} material={resources.paper} position={[-0.012, 0.018, 0.023]} scale={0.014}/>
        </group>)}
      </group>
      <mesh geometry={resources.smile} material={resources.green} position={[0, -0.07, 0.25]} rotation={[0, 0, Math.PI]}/>
    </group>
  </group>;
}

export default function PlaygroundScene(props: PlaygroundSceneProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current;
    element?.addEventListener('webglcontextlost', props.onFailure);
    return () => element?.removeEventListener('webglcontextlost', props.onFailure);
  }, [props.onFailure]);
  return <Canvas ref={canvas} className="playground-canvas" aria-hidden="true" camera={{ position: [0, 0, 7.4], fov: 37 }}
    dpr={[1, 1.5]} frameloop={props.animate ? 'always' : 'demand'}
    gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}>
    <ambientLight intensity={1.15}/>
    <directionalLight position={[-3, 5, 5]} intensity={2.5}/>
    <directionalLight position={[4, -2, -3]} intensity={1.2} color={COLORS.core}/>
    <Model {...props}/>
  </Canvas>;
}
