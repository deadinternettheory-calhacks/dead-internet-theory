import { describe, expect, it } from 'vitest';
import { advanceGlobe, createGlobeMotion, dragGlobe, grabGlobe, releaseGlobe, stopGlobe } from './globe-motion';

function flick(distance: number, duration: number) {
  const motion = createGlobeMotion();
  grabGlobe(motion, 1, 0, 0, 0, false);
  dragGlobe(motion, 1, distance, distance / 2, duration, 300);
  releaseGlobe(motion, duration + 5);
  return motion;
}

describe('globe momentum', () => {
  it('turns with the drag and carries release speed into a decaying spin', () => {
    const slow = flick(50, 200);
    const fast = flick(50, 100);
    expect(fast.yaw).toBeCloseTo(slow.yaw);
    expect(fast.velocityYaw).toBeCloseTo(slow.velocityYaw * 2);
    const before = fast.yaw;
    const speed = fast.velocityYaw;
    advanceGlobe(fast, 0.25);
    expect(fast.yaw).toBeGreaterThan(before);
    expect(fast.velocityYaw).toBeGreaterThan(0);
    expect(fast.velocityYaw).toBeLessThan(speed);
    for (let i = 0; i < 120; i++) advanceGlobe(fast, 1 / 30);
    expect(fast.velocityYaw).toBeLessThan(0.01);
  });

  it('produces the same inertial turn at different rendering frame rates', () => {
    const low = flick(80, 100);
    const high = flick(80, 100);
    for (let i = 0; i < 60; i++) advanceGlobe(low, 1 / 30);
    for (let i = 0; i < 240; i++) advanceGlobe(high, 1 / 120);
    expect(low.yaw).toBeCloseTo(high.yaw, 10);
    expect(low.pitch).toBeCloseTo(high.pitch, 10);
    expect(low.velocityYaw).toBeCloseTo(high.velocityYaw, 10);
  });

  it('catches the moving globe immediately when grabbed again', () => {
    const motion = flick(80, 100);
    const yaw = motion.yaw;
    grabGlobe(motion, 2, 0, 0, 200, false);
    advanceGlobe(motion, 1);
    expect(motion.yaw).toBe(yaw);
    expect(motion.velocityYaw).toBe(0);
  });

  it('avoids a stale throw when held still before release', () => {
    const motion = createGlobeMotion();
    grabGlobe(motion, 1, 0, 0, 0, false);
    dragGlobe(motion, 1, 80, 0, 100, 300);
    releaseGlobe(motion, 300);
    expect(motion.velocityYaw).toBe(0);
    expect(motion.drag).toBeNull();
  });

  it('caps the combined speed of a very fast diagonal flick', () => {
    const motion = flick(10000, 1);
    expect(Math.hypot(motion.velocityPitch, motion.velocityYaw)).toBeCloseTo(8);
  });

  it('gives vertical touch gestures to page scrolling and keeps horizontal swipes level', () => {
    const motion = createGlobeMotion();
    grabGlobe(motion, 1, 100, 100, 0, true);
    expect(dragGlobe(motion, 1, 102, 102, 10, 300)).toBe('pending');
    expect(dragGlobe(motion, 1, 102, 120, 20, 300)).toBe('scroll');
    expect(motion.yaw).toBe(0);
    grabGlobe(motion, 2, 100, 100, 30, true);
    expect(dragGlobe(motion, 2, 120, 102, 50, 300)).toBe('dragging');
    expect(motion.yaw).toBeGreaterThan(0);
    expect(motion.pitch).toBe(0);
    expect(motion.velocityPitch).toBe(0);
  });

  it('ignores unrelated fingers and clears momentum on cancellation', () => {
    const motion = createGlobeMotion();
    grabGlobe(motion, 1, 0, 0, 0, false);
    expect(dragGlobe(motion, 2, 100, 100, 20, 300)).toBe('ignored');
    expect(motion.yaw).toBe(0);
    dragGlobe(motion, 1, 100, 0, 100, 300);
    stopGlobe(motion);
    expect(motion.drag).toBeNull();
    expect(motion.velocityYaw).toBe(0);
  });
});
