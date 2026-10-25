import { expect, it } from 'vitest';
import { ghostTravel } from './playground-motion';

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
