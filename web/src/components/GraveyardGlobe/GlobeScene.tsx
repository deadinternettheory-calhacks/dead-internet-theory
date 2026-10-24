import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { CanvasTexture, ExtrudeGeometry, MathUtils, type Group, SRGBColorSpace } from 'three';
import { createHeadstoneShape, createWireframe, GLOBE_RADIUS, GRAVES } from './globe-model';
import { advanceGlobe, type GlobeMotion } from './globe-motion';

type SceneProps = {
  animate: boolean;
  pointer: RefObject<{ x: number; y: number }>;
  motion: RefObject<GlobeMotion>;
  onReady: (invalidate: () => void) => void;
  onFailure: () => void;
};

function inscription(color: string) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.fillStyle = color;
  context.textAlign = 'center';
  context.font = '600 32px Georgia, serif';
  context.fillText('RIP', 64, 63);
  context.fillRect(43, 79, 42, 3);
  context.fillRect(51, 89, 26, 3);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function Model({ animate, pointer, motion, onReady }: Omit<SceneProps, 'onFailure'>) {
  const globe = useRef<Group>(null);
  const tilt = useRef<Group>(null);
  const elapsed = useRef(0);
  const firstFrame = useRef(true);
  const resources = useMemo(() => ({
    wire: createWireframe(),
    stone: new ExtrudeGeometry(createHeadstoneShape(), {
      depth: 0.085, bevelEnabled: true, bevelSegments: 3,
      steps: 1, bevelSize: 0.016, bevelThickness: 0.016, curveSegments: 16,
    }).translate(0, 0, -0.0425),
    darkInk: inscription('#284D43'),
    lightInk: inscription('#EAF1ED'),
  }), []);

  useEffect(() => () => {
    resources.wire.dispose();
    resources.stone.dispose();
    resources.darkInk.dispose();
    resources.lightInk.dispose();
  }, [resources]);

  useFrame((state, delta) => {
    if (firstFrame.current) { firstFrame.current = false; onReady(state.invalidate); }
    if (!globe.current || !tilt.current) return;
    // Clamp the first frame after a background tab so resuming never jumps ahead.
    const dt = Math.min(delta, 0.05);
    if (animate) advanceGlobe(motion.current, dt);
    globe.current.rotation.set(motion.current.pitch, motion.current.yaw, 0, 'YXZ');
    if (!animate || motion.current.drag) return;
    elapsed.current += dt;
    const t = elapsed.current;
    tilt.current.rotation.x = MathUtils.damp(tilt.current.rotation.x, 0.14 + pointer.current.y * 0.14, 3, dt);
    tilt.current.rotation.z = MathUtils.damp(tilt.current.rotation.z, -0.18 - pointer.current.x * 0.14, 3, dt);
    tilt.current.position.y = Math.sin(t * 0.8) * 0.055;
  });

  return <group ref={tilt} rotation={[0.14, 0, -0.18]}>
    <group ref={globe} name="graveyard-globe-rotation" rotation={[0, 0, 0]}>
      <mesh>
        <sphereGeometry args={[GLOBE_RADIUS - 0.006, 48, 32]}/>
        <meshBasicMaterial color="#FAFAF8" toneMapped={false}/>
      </mesh>
      <lineSegments geometry={resources.wire}>
        <lineBasicMaterial color="#648575" transparent opacity={0.52}/>
      </lineSegments>
      {GRAVES.map((grave, index) => <group key={index} position={grave.position} quaternion={grave.quaternion} scale={grave.scale}>
        <mesh geometry={resources.stone}>
          <meshStandardMaterial color={grave.dark ? '#284D43' : '#D4DFD5'} roughness={0.42} metalness={0.12}/>
        </mesh>
        <mesh position={[0, 0.01, 0]}>
          <boxGeometry args={[0.33, 0.045, 0.17]}/>
          <meshStandardMaterial color={grave.dark ? '#1F3D35' : '#BDCDBF'} roughness={0.65}/>
        </mesh>
        <mesh position={[0, 0.18, 0.06]}>
          <planeGeometry args={[0.23, 0.23]}/>
          <meshBasicMaterial map={grave.dark ? resources.lightInk : resources.darkInk} transparent depthWrite={false}/>
        </mesh>
        <mesh position={[0, 0.18, -0.06]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.23, 0.23]}/>
          <meshBasicMaterial map={grave.dark ? resources.lightInk : resources.darkInk} transparent depthWrite={false}/>
        </mesh>
      </group>)}
    </group>
  </group>;
}

export default function GlobeScene({ animate, pointer, motion, onReady, onFailure }: SceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    // Canvas owns and disposes the renderer; the listener also handles later GPU loss.
    const canvas = canvasRef.current;
    canvas?.addEventListener('webglcontextlost', onFailure);
    return () => canvas?.removeEventListener('webglcontextlost', onFailure);
  }, [onFailure]);

  return <Canvas ref={canvasRef} className="globe-canvas" camera={{ position: [0, 0.15, 6.7], fov: 36 }}
    dpr={[1, 1.5]} frameloop={animate ? 'always' : 'demand'}
    gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}>
    <ambientLight intensity={1.8}/>
    <directionalLight position={[-3, 5, 4]} intensity={3.2} color="#FFFFFF"/>
    <directionalLight position={[4, 1, -3]} intensity={1.8} color="#EAF1ED"/>
    <Model animate={animate} pointer={pointer} motion={motion} onReady={onReady}/>
  </Canvas>;
}
