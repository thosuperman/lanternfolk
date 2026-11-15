import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/game/levels.js';
import { distXZ } from '../src/game/logic.js';

describe('level layouts', () => {
  it('has three levels teaching three different hand mechanics', () => {
    expect(LEVELS.map((l) => l.mechanic)).toEqual(['bridge', 'lift', 'leaf']);
  });
  it('every route starts where the folk sleeps and ends near its seat', () => {
    for (const level of LEVELS) {
      for (const f of level.folk) {
        const first = f.route[0];
        expect(first.kind).toBe('walk');
        if (first.kind === 'walk') expect(distXZ(first.line.points[0], f.start)).toBeLessThan(1e-6);
        const last = f.route[f.route.length - 1];
        expect(last.kind).toBe('walk');
        if (last.kind === 'walk') expect(distXZ(last.line.points[last.line.points.length - 1], f.seat)).toBeLessThan(0.02);
      }
    }
  });
  it('bridge gaps are wider than a hop but narrower than a hand', () => {
    for (const level of LEVELS) {
      for (const f of level.folk) {
        for (const seg of f.route) {
          if (seg.kind !== 'bridge') continue;
          const gap = Math.hypot(seg.span.to.x - seg.span.from.x, seg.span.to.z - seg.span.from.z) - 2 * seg.span.groundLength;
          expect(gap).toBeGreaterThan(0.05);
          expect(gap).toBeLessThan(0.17);
        }
      }
    }
  });
  it('seats do not overlap', () => {
    const seats = LEVELS.flatMap((l) => l.folk.map((f) => f.seat));
    for (let i = 0; i < seats.length; i++)
      for (let j = i + 1; j < seats.length; j++) expect(distXZ(seats[i], seats[j])).toBeGreaterThan(0.015);
  });
});
