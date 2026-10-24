type Drag = {
  id: number;
  touch: boolean;
  pending: boolean;
  startX: number;
  startY: number;
  x: number;
  y: number;
  time: number;
  moved: boolean;
};

export type GlobeMotion = {
  pitch: number;
  yaw: number;
  velocityPitch: number;
  velocityYaw: number;
  drag: Drag | null;
};

const FRICTION = 1.6;
const MAX_SPEED = 8;

export function createGlobeMotion(): GlobeMotion {
  return { pitch: 0, yaw: 0, velocityPitch: 0, velocityYaw: 0, drag: null };
}

export function stopGlobe(motion: GlobeMotion) {
  motion.drag = null;
  motion.velocityPitch = motion.velocityYaw = 0;
}

export function grabGlobe(motion: GlobeMotion, id: number, x: number, y: number, time: number, touch: boolean) {
  stopGlobe(motion);
  motion.drag = { id, x, y, startX: x, startY: y, time, touch, pending: touch, moved: false };
}

export function dragGlobe(motion: GlobeMotion, id: number, x: number, y: number, time: number, height: number) {
  const drag = motion.drag;
  if (!drag || drag.id !== id) return 'ignored';
  if (drag.pending) {
    const dx = Math.abs(x - drag.startX);
    const dy = Math.abs(y - drag.startY);
    if (Math.max(dx, dy) < 6) return 'pending';
    // The browser owns vertical touch gestures; a horizontal swipe spins the globe.
    if (dy > dx) { stopGlobe(motion); return 'scroll'; }
    drag.pending = false;
  }
  const sensitivity = Math.PI / Math.max(height, 1);
  const pitch = drag.touch ? 0 : (y - drag.y) * sensitivity;
  const yaw = (x - drag.x) * sensitivity;
  const dt = Math.max((time - drag.time) / 1000, 1 / 240);
  motion.pitch += pitch;
  motion.yaw += yaw;
  const blend = drag.moved ? 1 - Math.exp(-dt * 30) : 1;
  motion.velocityPitch += (pitch / dt - motion.velocityPitch) * blend;
  motion.velocityYaw += (yaw / dt - motion.velocityYaw) * blend;
  const speed = Math.hypot(motion.velocityPitch, motion.velocityYaw);
  if (speed > MAX_SPEED) {
    motion.velocityPitch *= MAX_SPEED / speed;
    motion.velocityYaw *= MAX_SPEED / speed;
  }
  drag.x = x;
  drag.y = y;
  drag.time = time;
  drag.moved = true;
  return 'dragging';
}

export function releaseGlobe(motion: GlobeMotion, time: number) {
  const drag = motion.drag;
  // Holding still before release should not throw using an old movement sample.
  if (!drag?.moved || time - drag.time > 80) {
    motion.velocityPitch = motion.velocityYaw = 0;
  }
  motion.drag = null;
}

export function advanceGlobe(motion: GlobeMotion, dt: number) {
  if (motion.drag || dt <= 0) return;
  const decay = Math.exp(-FRICTION * dt);
  // Integrate exponential drag exactly so momentum feels the same at 30 or 120 Hz.
  const distance = (1 - decay) / FRICTION;
  motion.pitch += motion.velocityPitch * distance;
  motion.yaw += motion.velocityYaw * distance + 0.12 * dt;
  motion.velocityPitch *= decay;
  motion.velocityYaw *= decay;
}
