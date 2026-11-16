import { describe, expect, it } from 'vitest';
import {
  BridgeSpan,
  BridgeStep,
  canBoard,
  canLand,
  canSnap,
  createHandSample,
  grabbingHand,
  HandSample,
  invertRigid,
  isPoking,
  palmSurface,
  JOINT_COUNT,
  polyline,
  rotY,
  samplePolyline,
  stepBridge,
  supportAt,
  transformPoint,
  updatePinch,
  v3,
} from '../src/game/logic.js';

/** A flat synthetic hand: joints spread on a 18 x 8 cm rectangle at height y. */
function flatHand(cx: number, y: number, cz: number, alongX = true): HandSample {
  const h = createHandSample();
  h.present = true;
  for (let i = 0; i < JOINT_COUNT; i++) {
    const u = (i % 5) / 4 - 0.5; // -0.5..0.5
    const w = Math.floor(i / 5) / 4 - 0.5;
    const a = u * 0.18;
    const b = w * 0.08;
    h.joints[i * 3] = cx + (alongX ? a : b);
    h.joints[i * 3 + 1] = y;
    h.joints[i * 3 + 2] = cz + (alongX ? b : a);
    h.radii[i] = 0.01;
  }
  h.wrist.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, cx, y, cz, 1]);
  return h;
}

const none = () => createHandSample();

describe('supportAt', () => {
  it('finds the top of the hand above a point', () => {
    const out = { y: 0, hand: -1 };
    supportAt(0, 0, [none(), flatHand(0, 0.02, 0)], out);
    expect(out.hand).toBe(1);
    expect(out.y).toBeCloseTo(0.0255);
  });
  it('ignores absent hands and far points', () => {
    const out = { y: 0, hand: -1 };
    supportAt(0.5, 0.5, [flatHand(0, 0, 0)], out);
    expect(out.hand).toBe(-1);
    expect(out.y).toBe(-Infinity);
  });
});

describe('stepBridge', () => {
  const span: BridgeSpan = { from: v3(0, 0, 0.2), to: v3(0, 0, 0.1), groundLength: 0.012 };
  const step: BridgeStep = { s: 0, y: 0, blocked: false, onHand: false, hand: -1 };

  it('waits at the edge with no hand', () => {
    stepBridge(span, 0.012, 0.04, 0.016, [none(), none()], step);
    expect(step.blocked).toBe(true);
  });

  it('crosses when a hand lies across the gap at path height', () => {
    const hands = [none(), flatHand(0, -0.005, 0.15, false)];
    let s = 0;
    for (let i = 0; i < 400 && s < 0.1 - 1e-4; i++) {
      stepBridge(span, s, 0.04, 0.016, hands, step);
      expect(step.blocked).toBe(false);
      s = step.s;
    }
    expect(s).toBeGreaterThanOrEqual(0.1 - 1e-4);
  });

  it('crosses at walking speed, not faster (regression)', () => {
    const hands = [none(), flatHand(0, -0.005, 0.15, false)];
    let s = 0;
    let frames = 0;
    while (s < 0.1 - 1e-4 && frames < 2000) {
      stepBridge(span, s, 0.036, 1 / 90, hands, step);
      s = step.s;
      frames++;
    }
    // ~0.1 m at 3.6 cm/s is close to 2.8 s of frames at 90 Hz.
    expect(frames / 90).toBeGreaterThan(2.4);
    expect(frames / 90).toBeLessThan(3.4);
  });

  it('refuses a hand held far above the path', () => {
    const hands = [flatHand(0, 0.2, 0.15, false)];
    stepBridge(span, 0.012, 0.04, 0.016, hands, step);
    expect(step.blocked).toBe(true);
  });
});

describe('lift', () => {
  const pad = v3(0, -0.12, 0.24);
  it('boards when a hand is offered at the pad', () => {
    const out = { y: 0, hand: -1 };
    expect(canBoard(pad, [flatHand(0, -0.13, 0.24)], out)).toBe(true);
    expect(canBoard(pad, [flatHand(0, 0.2, 0.24)], out)).toBe(false);
  });
  it('lands only near the destination', () => {
    expect(canLand(v3(0.02, 0.03, 0.11), v3(0, 0, 0.112))).toBe(true);
    expect(canLand(v3(0.2, 0.03, 0.11), v3(0, 0, 0.112))).toBe(false);
    expect(canLand(v3(0, 0.3, 0.11), v3(0, 0, 0.112))).toBe(false);
  });
  it('keeps the rider fixed relative to the wrist', () => {
    const wrist = new Float32Array([0, 0, -1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0.1, 0.2, 0.3, 1]);
    const inv = invertRigid(wrist, new Float32Array(16));
    const p = v3(0.12, 0.25, 0.31);
    const local = transformPoint(inv, p, v3());
    const back = transformPoint(wrist, local, v3());
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
    expect(back.z).toBeCloseTo(p.z);
  });
});

describe('palmSurface', () => {
  it('stands on top of the palm, whichever way the hand faces', () => {
    const h = createHandSample();
    h.present = true;
    // wrist at origin, knuckles 9 cm ahead in -z, spread along x, all at y = 0.1
    const set = (i: number, x: number, z: number) => h.joints.set([x, 0.1, z], i * 3);
    set(0, 0, 0);
    set(6, 0.035, -0.09);
    set(11, 0.012, -0.095);
    set(16, -0.012, -0.093);
    set(21, -0.033, -0.085);
    const p = palmSurface(h, v3());
    expect(p.y).toBeCloseTo(0.12, 3);
    // mirrored (palm facing down): normal flips, still stands above
    set(6, -0.035, -0.09);
    set(21, 0.033, -0.085);
    expect(palmSurface(h, v3()).y).toBeCloseTo(0.12, 3);
  });
});

describe('pinch and poke', () => {
  it('uses hysteresis so jitter cannot drop a held object', () => {
    expect(updatePinch(false, 0.03, false)).toBe(false);
    expect(updatePinch(false, 0.015, false)).toBe(true);
    expect(updatePinch(true, 0.03, false)).toBe(true);
    expect(updatePinch(true, 0.05, false)).toBe(false);
    expect(updatePinch(false, 0.1, true)).toBe(true);
  });
  it('grabs with the closest pinching hand only', () => {
    const a = flatHand(0, 0, 0);
    const b = flatHand(0, 0, 0);
    a.pinching = true;
    a.pinchPoint = v3(0.03, 0, 0);
    b.pinching = false;
    b.pinchPoint = v3(0, 0, 0);
    expect(grabbingHand([a, b], v3(0, 0, 0))).toBe(0);
    a.pinchPoint = v3(0.3, 0, 0);
    expect(grabbingHand([a, b], v3(0, 0, 0))).toBe(-1);
  });
  it('detects a fingertip touch', () => {
    const h = flatHand(0, 0, 0);
    h.indexTip = v3(0.01, 0.01, 0);
    expect(isPoking([h], v3(0, 0, 0))).toBe(true);
    h.indexTip = v3(0.2, 0, 0);
    expect(isPoking([h], v3(0, 0, 0))).toBe(false);
  });
  it('snaps within radius', () => {
    expect(canSnap(v3(0, 0, 0.05), v3(0, 0, 0))).toBe(true);
    expect(canSnap(v3(0, 0, 0.2), v3(0, 0, 0))).toBe(false);
  });
});

describe('paths', () => {
  it('samples along a polyline', () => {
    const line = polyline([v3(0, 0, 0), v3(0, 0, 1), v3(1, 0, 1)]);
    expect(line.total).toBeCloseTo(2);
    const p = samplePolyline(line, 1.5, v3());
    expect(p.x).toBeCloseTo(0.5);
    expect(p.z).toBeCloseTo(1);
  });
  it('rotates zone frames about +y', () => {
    const p = rotY(v3(0, 0, 1), Math.PI / 2);
    expect(p.x).toBeCloseTo(1);
    expect(p.z).toBeCloseTo(0);
  });
});
