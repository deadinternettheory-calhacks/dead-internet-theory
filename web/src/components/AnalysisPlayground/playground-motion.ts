import type { PlaygroundPhase } from './playground-types';

/** Keep the whole character (including its hop, arms and lens) inside the viewport. */
export function ghostTravel(time: number, width: number, height: number) {
  const xRange = Math.max(0, width / 2 - 1.05);
  const yRange = Math.max(0, height / 2 - 1.35);
  return {
    x: Math.sin(time * 0.21 + 1.2) * xRange,
    y: Math.sin(time * 0.29 - 0.3) * yRange,
  };
}
/** Bounded illustration: spawn during collection, then inspect a rotating double helix. */
export function commentFlight({ phase, age, time, index, count, width, height }: {
  phase: PlaygroundPhase; age: number; time: number; index: number; count: number; width: number; height: number;
}) {
  const xRange = Math.max(0.5, width / 2 - 0.55), yRange = Math.max(0.5, height / 2 - 0.55);
  if (phase === 'collecting') {
    const travel = (index / count + age * 0.055) % 1;
    const angle = travel * Math.PI * 2.7;
    const radius = 0.25 + (1 - travel) * 0.75;
    const born = Math.max(0, Math.min(1, (age - index * 0.38) / 0.5));
    return {
      x: Math.cos(angle) * xRange * radius, y: Math.sin(angle) * yRange * radius, z: -1,
      arrival: born * born * (3 - 2 * born) * Math.min(1, travel * 12, (1 - travel) * 12), scan: 0,
    };
  }
  if (phase === 'analyzing') {
    const perStrand = Math.ceil(count / 2), row = index % perStrand;
    const angle = row * 0.8 + Math.floor(index / perStrand) * Math.PI + age * 0.55;
    const distance = Math.abs(index - (age * 2) % count);
    return {
      x: Math.sin(angle) * xRange * 0.95,
      y: (row / Math.max(1, perStrand - 1) * 2 - 1) * yRange * 0.92,
      z: -1 + Math.cos(angle) * 0.8, arrival: 1,
      scan: Math.exp(-(Math.min(distance, count - distance) ** 2) * 2),
    };
  }
  const angle = index / count * Math.PI * 2 + time * 0.035;
  return {
    x: Math.cos(angle) * xRange, y: Math.sin(angle * 2 + time * 0.1) * yRange,
    z: -1 + Math.sin(angle) * 0.2, arrival: phase === 'starting' || phase === 'queued' ? 0 : 1, scan: 0,
  };
}
