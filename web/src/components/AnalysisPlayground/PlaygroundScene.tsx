import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  BoxGeometry, ExtrudeGeometry, IcosahedronGeometry, LineBasicMaterial,
  MathUtils, MeshBasicMaterial, MeshStandardMaterial, Object3D, SphereGeometry,
  TorusGeometry, type Group, type InstancedMesh,
} from 'three';
import { createHeadstoneShape, createWireframe, GRAVES } from '../GraveyardGlobe/globe-model';
import { advanceGlobe } from '../GraveyardGlobe/globe-motion';
import { formationFor, type PlaygroundSceneProps } from './playground-types';

const SPARKS = 32;
const TAU = Math.PI * 2;
const COLORS = { paper: '#FFFFFF', core: '#EAF1ED', green: '#9BB5A7', sage: '#E2EAE3', ink: '#A8BFB0', trim: '#D4DFD5', gold: '#C5A980' };

function Model({ animate, phase, pulse, pointer, motion, onReady }: Omit<PlaygroundSceneProps, 'onFailure'>) {
  const { invalidate } = useThree();
  const world = useRef<Group>(null);
  const tilt = useRef<Group>(null);
  const core = useRef<Group>(null);
  const halo = useRef<Group>(null);
  const ripples = useRef<Group[]>([]);
  const sparks = useRef<InstancedMesh>(null);
  const time = useRef(0);
  const pulseAge = useRef(3);
  const first = useRef(true);
  const initialized = useRef(false);
  const formation = formationFor(phase);
  const lastPhase = useRef(phase);
  const stamp = useMemo(() => new Object3D(), []);
  const resources = useMemo(() => ({
    wire: createWireframe(),
    sphere: new SphereGeometry(1.44, 36, 24),
    stone: new ExtrudeGeometry(createHeadstoneShape(), { depth: 0.09, bevelEnabled: true, bevelSize: 0.016, bevelThickness: 0.016, bevelSegments: 2, steps: 1, curveSegments: 10 }).translate(0, 0, -0.045),
    box: new BoxGeometry(1, 1, 1),
    ring: new TorusGeometry(1.38, 0.012, 6, 128),
    ripple: new TorusGeometry(1, 0.012, 6, 96),
    spark: new IcosahedronGeometry(0.035, 0),
    green: new MeshStandardMaterial({ color: COLORS.green, roughness: 0.4, metalness: 0.12 }),
    sage: new MeshStandardMaterial({ color: COLORS.sage, roughness: 0.45 }),
    // An opaque surface hides the graves and grid on the far side.
    core: new MeshBasicMaterial({ color: '#FAFAF8', toneMapped: false }),
    trim: new MeshStandardMaterial({ color: COLORS.trim, metalness: 0.4, roughness: 0.35 }),
    ink: new MeshBasicMaterial({ color: COLORS.ink }),
    lightInk: new MeshBasicMaterial({ color: COLORS.core }),
    gold: new MeshStandardMaterial({ color: COLORS.gold, metalness: 0.45, roughness: 0.3 }),
    sparkle: new MeshBasicMaterial({ color: COLORS.gold }),
    wireInk: new LineBasicMaterial({ color: '#648575', transparent: true, opacity: 0.9, depthWrite: false }),
  }), []);
  const rippleMaterials = useMemo(() => Array.from({ length: 3 }, () => new MeshBasicMaterial({ color: COLORS.green, transparent: true, opacity: 0, depthWrite: false })), []);

  useEffect(() => () => {
    Object.values(resources).forEach(resource => resource.dispose());
    rippleMaterials.forEach(material => material.dispose());
  }, [resources, rippleMaterials]);
  useEffect(() => { pulseAge.current = 0; invalidate(); }, [pulse, phase, invalidate]);
  useEffect(() => { invalidate(); }, [formation, animate, invalidate]);

  useFrame((state, delta) => {
    if (first.current) { first.current = false; onReady(state.invalidate); }
    if (!world.current || !tilt.current) return;
    const dt = Math.min(delta, 0.05);
    const phaseChanged = lastPhase.current !== phase;
    if (animate) {
      time.current += dt; pulseAge.current += dt; advanceGlobe(motion.current, dt);
      if (!motion.current.drag) {
        motion.current.yaw -= (formation === 'inspect' ? 0.12 : 0.06) * dt;
        if (formation === 'inspect' && Math.hypot(motion.current.velocityYaw, motion.current.velocityPitch) < 0.1) {
          motion.current.yaw = MathUtils.damp(motion.current.yaw, Math.round(motion.current.yaw / TAU) * TAU, 1.4, dt);
          motion.current.pitch = MathUtils.damp(motion.current.pitch, Math.round(motion.current.pitch / TAU) * TAU, 1.4, dt);
        }
      }
    }
    const t = time.current;
    const age = pulseAge.current;
    const shock = age < 1.6 ? Math.sin(Math.min(1, age / 1.6) * Math.PI) * Math.exp(-age * 1.5) : 0;
    const { width, height } = state.viewport;
    // The globe fills the background; comment positions use viewport dimensions
    // independently so portrait and landscape both reach all four edges.
    const globeScale = Math.max(width, height) * 0.30;
    tilt.current.scale.setScalar(globeScale);
    tilt.current.position.set(-width * 0.14, -height * 0.10, -3);
    world.current.rotation.set(motion.current.pitch, motion.current.yaw, 0, 'YXZ');
    // Demand frames can still occur on resize or React commits. A paused scene
    // keeps its exact pose; direct turns and backend phase changes remain available.
    if (!animate && initialized.current && !phaseChanged) return;
    initialized.current = true;
    lastPhase.current = phase;
    tilt.current.rotation.x = MathUtils.damp(tilt.current.rotation.x, 0.12 + pointer.current.y * 0.10, 4, dt);
    tilt.current.rotation.z = MathUtils.damp(tilt.current.rotation.z, -0.07 - pointer.current.x * 0.08, 4, dt);
    if (core.current) { core.current.rotation.y = t * 0.16; core.current.position.y = Math.sin(t * 0.8) * 0.07; }
    if (halo.current) { halo.current.rotation.y = t * -0.13; halo.current.rotation.z = Math.sin(t * 0.3) * 0.1; }
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

  return <group dispose={null}>
    <group ref={tilt} rotation={[0.12, 0, -0.07]}>
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
    </group>
    </group>
    <group>
      {rippleMaterials.map((material,i) => <group key={i} ref={g => { if (g) ripples.current[i] = g; }}>
        <mesh geometry={resources.ripple} material={material} rotation={[0.25 + i * 0.55, i * 0.4, i * 0.2]}/>
      </group>)}
      <instancedMesh ref={sparks} args={[resources.spark, resources.sparkle, SPARKS]} frustumCulled={false}/>
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
  return <Canvas ref={canvas} className="playground-canvas" aria-hidden="true" orthographic camera={{ position: [0, 0, 20], zoom: 80, near: 0.1, far: 100 }}
    dpr={[1, 1.25]} frameloop={props.animate ? 'always' : 'demand'}
    gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}>
    <ambientLight intensity={1.15}/>
    <directionalLight position={[-3, 5, 5]} intensity={2.5}/>
    <directionalLight position={[4, -2, -3]} intensity={1.2} color={COLORS.core}/>
    <Model {...props}/>
  </Canvas>;
}
