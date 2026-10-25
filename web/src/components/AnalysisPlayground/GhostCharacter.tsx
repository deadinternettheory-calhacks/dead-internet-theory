import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { CircleGeometry, CylinderGeometry, ExtrudeGeometry, MathUtils, MeshBasicMaterial, MeshStandardMaterial, Shape, SphereGeometry, TorusGeometry, type Group } from 'three';
import { formationFor, type PlaygroundSceneProps } from './playground-types';

function bodyShape() {
  const s = new Shape();
  s.moveTo(-0.4, -0.34); s.lineTo(-0.4, 0.16);
  s.absarc(0, 0.16, 0.4, Math.PI, 0, true); s.lineTo(0.4, -0.34);
  s.quadraticCurveTo(0.4, -0.47, 0.26, -0.32);
  s.quadraticCurveTo(0.18, -0.24, 0.12, -0.37);
  s.quadraticCurveTo(0, -0.54, -0.12, -0.37);
  s.quadraticCurveTo(-0.18, -0.24, -0.26, -0.32);
  s.quadraticCurveTo(-0.4, -0.47, -0.4, -0.34);
  return s;
}

/** Local character reactions never imply a finding or a change in job progress. */
export function GhostCharacter({ animate, phase, pulse, pointer, motion }: Pick<PlaygroundSceneProps, 'animate' | 'phase' | 'pulse' | 'pointer' | 'motion'>) {
  const { invalidate } = useThree();
  const root = useRef<Group>(null);
  const eyes = useRef<Group>(null);
  const rightEye = useRef<Group>(null);
  const leftArm = useRef<Group>(null);
  const rightArm = useRef<Group>(null);
  const lens = useRef<Group>(null);
  const time = useRef(0);
  const reactionAge = useRef(3);
  const initialized = useRef(false);
  const lastPhase = useRef(phase);
  const formation = formationFor(phase);
  const resources = useMemo(() => ({
    body: new ExtrudeGeometry(bodyShape(), { depth: 0.4, bevelEnabled: true, bevelSize: 0.075, bevelThickness: 0.1, bevelSegments: 5, steps: 1, curveSegments: 24 }).translate(0, 0, -0.2),
    sphere: new SphereGeometry(1, 20, 16),
    cheek: new CircleGeometry(0.06, 20),
    smile: new TorusGeometry(0.105, 0.019, 8, 32, Math.PI),
    lens: new TorusGeometry(0.29, 0.035, 8, 48),
    glass: new CircleGeometry(0.27, 32),
    handle: new CylinderGeometry(0.045, 0.055, 0.36, 12),
    white: new MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.65, metalness: 0 }),
    ink: new MeshStandardMaterial({ color: '#284D43', roughness: 0.4 }),
    highlight: new MeshBasicMaterial({ color: '#FFFFFF' }),
    blush: new MeshBasicMaterial({ color: '#DDAF9E' }),
    gold: new MeshStandardMaterial({ color: '#A86518', roughness: 0.3, metalness: 0.4 }),
    glassInk: new MeshBasicMaterial({ color: '#D4DFD5', transparent: true, opacity: 0.13, depthWrite: false }),
  }), []);
  useEffect(() => () => Object.values(resources).forEach(r => r.dispose()), [resources]);
  useEffect(() => { if (pulse > 0) reactionAge.current = 0; invalidate(); }, [pulse, invalidate]);
  useEffect(() => { invalidate(); }, [phase, animate, invalidate]);

  useFrame((_, delta) => {
    if (!root.current) return;
    if (!animate && initialized.current && lastPhase.current === phase) return;
    initialized.current = true; lastPhase.current = phase;
    const dt = Math.min(delta, 0.05);
    if (animate) { time.current += dt; reactionAge.current += dt; }
    const t = time.current, age = reactionAge.current;
    const reaction = pulse % 3;
    const hop = age < 1.2 ? Math.sin(Math.min(1, age / 1.2) * Math.PI) * Math.exp(-age * 0.5) : 0;
    const wink = reaction === 2 && age < 1.35;
    const twirl = reaction === 0 && pulse > 0 && age < 1.4 ? MathUtils.smoothstep(age, 0, 1.4) * Math.PI * 2 : 0;
    const hello = formation === 'rest' && t % 10 < 1.8;
    const nod = formation === 'inspect' ? Math.sin(t * 1.4) * 0.07 : 0;
    root.current.position.set(Math.sin(t * 0.55) * 0.07, 0.08 + Math.sin(t * 1.5) * 0.11 + hop * 0.48, 1.5);
    root.current.rotation.set(pointer.current.y * 0.09 + nod, Math.sin(motion.current.yaw) * 0.23 + Math.sin(t * 0.45) * 0.06, twirl + Math.sin(t * 0.7) * 0.06 - pointer.current.x * 0.08);
    root.current.scale.set(1.3 + hop * 0.15, 1.3 - hop * 0.16, 1.3);
    if (eyes.current) eyes.current.scale.y = MathUtils.damp(eyes.current.scale.y, t % 5.5 > 5.28 ? 0.1 : 1 + hop * 0.25, 35, dt);
    if (rightEye.current) rightEye.current.scale.y = MathUtils.damp(rightEye.current.scale.y, wink && age > 0.12 && age < 0.8 ? 0.12 : 1, 30, dt);
    if (leftArm.current) leftArm.current.rotation.z = hello || wink ? -2.1 + Math.sin(t * 9) * 0.35 : formation === 'gather' ? -1.1 + Math.sin(t * 3) * 0.4 : -0.65 + Math.sin(t * 1.5) * 0.1;
    if (rightArm.current) {
      rightArm.current.rotation.z = formation === 'inspect' ? 0.9 : formation === 'gather' ? 1.1 - Math.sin(t * 3) * 0.4 : 0.65 - Math.sin(t * 1.5) * 0.1;
      rightArm.current.position.z = formation === 'inspect' ? 0.2 : 0.03;
    }
    if (lens.current) {
      lens.current.position.set(0.31 + Math.sin(t * 0.75) * 0.06, 0.12 + Math.sin(t * 0.65) * 0.07, 0.46);
      lens.current.rotation.z = -0.18 + Math.sin(t * 0.6) * 0.12;
    }
  });

  return <group ref={root} position={[0, 0.08, 1.5]} scale={1.3} dispose={null}>
    <mesh geometry={resources.body} material={resources.white}/>
    <group ref={leftArm} position={[-0.44, -0.04, 0.03]} rotation={[0, 0, -0.65]}>
      <mesh geometry={resources.sphere} material={resources.white} position={[0, -0.075, 0]} scale={[0.09, 0.17, 0.09]}/>
    </group>
    <group ref={rightArm} position={[0.44, -0.04, 0.03]} rotation={[0, 0, 0.65]}>
      <mesh geometry={resources.sphere} material={resources.white} position={[0, -0.075, 0]} scale={[0.09, 0.17, 0.09]}/>
    </group>
    <group ref={eyes} position={[0, 0.15, 0.325]}>
      {[-0.145,0.145].map(x => <group key={x} ref={x > 0 ? rightEye : undefined} position={[x, 0, 0]}>
        <mesh geometry={resources.sphere} material={resources.ink} scale={[0.066, 0.09, 0.035]}/>
        <mesh geometry={resources.sphere} material={resources.highlight} position={[-0.016, 0.024, 0.032]} scale={0.019}/>
        <mesh geometry={resources.sphere} material={resources.highlight} position={[0.017, -0.025, 0.032]} scale={0.008}/>
      </group>)}
    </group>
    {[-0.255,0.255].map(x => <mesh key={x} geometry={resources.cheek} material={resources.blush} position={[x, 0.005, 0.326]} scale={[1.1, 0.65, 1]}/>)}
    <mesh geometry={resources.smile} material={resources.ink} position={[0, -0.065, 0.33]} rotation={[0, 0, Math.PI]}/>
    <group ref={lens} visible={formation === 'inspect'} position={[0.31, 0.12, 0.46]} scale={0.82}>
      <mesh geometry={resources.lens} material={resources.gold}/>
      <mesh geometry={resources.glass} material={resources.glassInk}/>
      <mesh geometry={resources.handle} material={resources.ink} position={[0.22, -0.25, 0]} rotation={[0, 0, 0.72]}/>
    </group>
  </group>;
}
