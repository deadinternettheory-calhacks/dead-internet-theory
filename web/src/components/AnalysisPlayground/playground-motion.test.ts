import { expect, it } from 'vitest';
import { commentFlight, ghostTravel } from './playground-motion';

it.each([[320, 812], [375, 900], [768, 1024], [1440, 1000], [844, 390]])(
  'keeps the ghost, arms, lens and hop in the visible %i × %i viewport while roaming both axes',
  (width, height) => {
    const xs: number[] = [], ys: number[] = [];
    for (let t = 0; t < 240; t += 0.25) {
      const p = ghostTravel(t, width / 80, height / 80);
      expect(Math.abs(p.x) * 80 + 84).toBeLessThanOrEqual(width / 2);
      expect(Math.abs(p.y) * 80 + 108).toBeLessThanOrEqual(height / 2);
      xs.push(p.x); ys.push(p.y);
    }
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(0);
    expect(Math.min(...ys)).toBeLessThan(0);
    expect(Math.max(...ys)).toBeGreaterThan(0);
  },
);

it('spawns comment models progressively during collection and keeps the pool bounded', () => {
  const count = 18;
  const visible = (age: number) => Array.from({ length: count }, (_, index) => commentFlight({ phase: 'collecting', age, time: age, index, count, width: 18, height: 12 })).filter(c => c.arrival > 0.001).length;
  expect(visible(0)).toBe(0);
  expect(visible(0.25)).toBe(1);
  expect(visible(2)).toBeGreaterThan(visible(0.25));
  expect(visible(8)).toBe(count);
  expect(visible(600)).toBeLessThanOrEqual(count);
});

it('rotates the analysis helix and passes its scan highlight from one model to the next', () => {
  const at = (age: number, index = 0) => commentFlight({ phase: 'analyzing', age, time: age, index, count: 18, width: 18, height: 12 });
  expect(at(0).arrival).toBe(1);
  expect(at(1).x).not.toBe(at(0).x);
  expect(at(0).scan).toBe(1);
  expect(at(0.5, 1).scan).toBe(1);
  expect(at(0.5, 0).scan).toBeLessThan(at(0.5, 1).scan);
});
