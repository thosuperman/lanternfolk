import { describe, expect, it } from 'vitest';
import { distToSegment, LEVELS, obstacleAt, starIsletAt } from '../src/game/levels.js';
import { HOP_REACH, instability, updateBalance, v3 } from '../src/game/logic.js';

describe('balance', () => {
  it('a calm, flat palm never drains balance', () => {
    let b = 1;
    for (let i = 0; i < 600; i++) b = updateBalance(b, 0.3, 0.1, 1 / 60);
    expect(b).toBe(1);
  });
  it('a steep tilt or a fast flick makes the spirit slip within about a second', () => {
    let b = 1;
    let t = 0;
    while (b > 0 && t < 3) {
      b = updateBalance(b, 1.3, 0.1, 1 / 60);
      t += 1 / 60;
    }
    expect(t).toBeLessThan(1.2);
    expect(instability(0.2, 1.2)).toBeGreaterThan(0.5);
  });
  it('recovers when the hand settles', () => {
    let b = 0.3;
    for (let i = 0; i < 90; i++) b = updateBalance(b, 0.2, 0.05, 1 / 60);
    expect(b).toBeGreaterThan(0.95);
  });
  it('mild tracking jitter is tolerated', () => {
    expect(instability(0.6, 0.3)).toBe(0);
  });
});

describe('level 2 obstacles', () => {
  it('branches swing and keep their length', () => {
    const o = LEVELS[1].obstacles[0];
    const a = v3();
    const b = v3();
    obstacleAt(o, 0, a, b);
    const l0 = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const ax0 = a.x;
    obstacleAt(o, o.period / 4, a, b);
    expect(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)).toBeCloseTo(l0);
    expect(Math.abs(a.x - ax0)).toBeGreaterThan(0.005);
  });
  it('point-to-capsule distance', () => {
    expect(distToSegment(v3(0, 1, 0), v3(-1, 0, 0), v3(1, 0, 0))).toBeCloseTo(1);
    expect(distToSegment(v3(2, 0, 0), v3(-1, 0, 0), v3(1, 0, 0))).toBeCloseTo(1);
  });
});

describe('level 3 star', () => {
  it('the star islet drifts within reach of its centre', () => {
    const star = LEVELS[2].star!;
    const p = v3();
    for (let t = 0; t < star.period; t += 0.5) {
      starIsletAt(star, t, p);
      expect(Math.hypot(p.x - star.center.x, p.z - star.center.z)).toBeLessThan(0.06);
    }
  });
});

describe('every palm bridge needs a hand', () => {
  it('no hand-bridge gap is short enough to hop over', () => {
    for (const level of LEVELS) {
      for (const f of level.folk) {
        for (const seg of f.route) {
          if (seg.kind !== 'bridge' || seg.leafSlot) continue;
          const len = Math.hypot(seg.span.to.x - seg.span.from.x, seg.span.to.z - seg.span.from.z);
          expect(len - 2 * seg.span.groundLength).toBeGreaterThan(HOP_REACH + 0.01);
        }
      }
    }
  });
  it('level 1 has two crossings, level 2 two lifts', () => {
    expect(LEVELS[0].folk[0].route.filter((s) => s.kind === 'bridge').length).toBe(2);
    expect(LEVELS[1].folk[0].route.filter((s) => s.kind === 'lift').length).toBe(2);
  });
});
