/**
 * Pure, renderer-free gameplay rules for Lanternfolk.
 *
 * Everything here works in "island-local" metres (y up, +z toward the player)
 * so it can be unit-tested without WebXR, Three.js or a headset.
 */

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const copyV3 = (o: V3, a: V3): V3 => {
  o.x = a.x;
  o.y = a.y;
  o.z = a.z;
  return o;
};
export const lerpV3 = (o: V3, a: V3, b: V3, t: number): V3 => {
  o.x = a.x + (b.x - a.x) * t;
  o.y = a.y + (b.y - a.y) * t;
  o.z = a.z + (b.z - a.z) * t;
  return o;
};
export const dist3 = (a: V3, b: V3) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const distXZ = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.z - b.z);
export const clamp = (v: number, lo: number, hi: number) =>
  v < lo ? lo : v > hi ? hi : v;
export const smoothstep = (t: number) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

/** WebXR hand joint count (XRHand.size). */
export const JOINT_COUNT = 25;

/** One tracked hand, already converted into island-local space. */
export interface HandSample {
  present: boolean;
  /** 25 joints * xyz, WebXR joint order. */
  joints: Float32Array;
  /** Joint radii reported by the runtime (metres). */
  radii: Float32Array;
  indexTip: V3;
  thumbTip: V3;
  pinchPoint: V3;
  pinching: boolean;
  /** Column-major 4x4 of the wrist joint in island-local space. */
  wrist: Float32Array;
}

export function createHandSample(): HandSample {
  return {
    present: false,
    joints: new Float32Array(JOINT_COUNT * 3),
    radii: new Float32Array(JOINT_COUNT).fill(0.01),
    indexTip: v3(),
    thumbTip: v3(),
    pinchPoint: v3(),
    pinching: false,
    wrist: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  };
}

/** Horizontal reach (metres) within which a joint can hold a folk up. */
export const SUPPORT_RADIUS = 0.045;

export interface SupportResult {
  /** Height a folk would stand at, or -Infinity when nothing is there. */
  y: number;
  /** Index of the supporting hand, or -1. */
  hand: number;
}

/**
 * Where (if anywhere) a hand offers a surface above point (x, z).
 * Orientation-agnostic: palm up, palm down or a loose fist all work, because
 * we only look at the highest tracked joint near the point. That keeps the
 * mechanic forgiving for first-time hand-tracking users.
 */
export function supportAt(
  x: number,
  z: number,
  hands: readonly HandSample[],
  out: SupportResult,
  radius = SUPPORT_RADIUS,
): SupportResult {
  out.y = -Infinity;
  out.hand = -1;
  const r2 = radius * radius;
  for (let h = 0; h < hands.length; h++) {
    const hand = hands[h];
    if (!hand.present) continue;
    const j = hand.joints;
    for (let i = 0; i < JOINT_COUNT; i++) {
      const dx = j[i * 3] - x;
      const dz = j[i * 3 + 2] - z;
      if (dx * dx + dz * dz > r2) continue;
      const top = j[i * 3 + 1] + hand.radii[i];
      if (top > out.y) {
        out.y = top;
        out.hand = h;
      }
    }
  }
  return out;
}

/** Pinch with hysteresis so tracking jitter cannot drop a held object. */
export const PINCH_START = 0.022;
export const PINCH_END = 0.04;
export function updatePinch(
  wasPinching: boolean,
  tipDistance: number,
  selectPressed: boolean,
): boolean {
  if (selectPressed) return true;
  return wasPinching ? tipDistance < PINCH_END : tipDistance < PINCH_START;
}

/** Index fingertip close enough to "touch" a target. */
export const POKE_RADIUS = 0.04;
export function isPoking(hands: readonly HandSample[], target: V3): boolean {
  for (const h of hands) {
    if (h.present && dist3(h.indexTip, target) < POKE_RADIUS) return true;
  }
  return false;
}

/* ------------------------------------------------------------------------ */
/* Bridge: a straight gap the folk crosses only while a hand covers it.     */
/* ------------------------------------------------------------------------ */

export interface BridgeSpan {
  from: V3;
  to: V3;
  /** Metres at each end that are solid ground. */
  groundLength: number;
}

export interface BridgeStep {
  /** New distance travelled along the span. */
  s: number;
  /** Height to stand at. */
  y: number;
  /** True when the folk had to stop because nothing is ahead. */
  blocked: boolean;
  /** True when the folk is currently standing on a hand. */
  onHand: boolean;
}

/** How far ahead a folk will hop onto a hand (forgives small gaps). */
export const HOP_REACH = 0.05;
/** How far the hand may sit above/below the path and still count. */
export const BRIDGE_HEIGHT_TOLERANCE = 0.09;

const _sup: SupportResult = { y: 0, hand: -1 };
const _p = v3();

export function spanLength(span: BridgeSpan) {
  return dist3(span.from, span.to);
}

function groundHeight(span: BridgeSpan, s: number) {
  const L = spanLength(span);
  return span.from.y + (span.to.y - span.from.y) * clamp(s / L, 0, 1);
}

/** Is position s on the span solid (ground or a hand at a sensible height)? */
export function bridgeSupport(
  span: BridgeSpan,
  s: number,
  hands: readonly HandSample[],
): number {
  const L = spanLength(span);
  if (s <= span.groundLength || s >= L - span.groundLength) {
    return groundHeight(span, s);
  }
  lerpV3(_p, span.from, span.to, s / L);
  supportAt(_p.x, _p.z, hands, _sup);
  if (_sup.hand < 0) return -Infinity;
  if (Math.abs(_sup.y - _p.y) > BRIDGE_HEIGHT_TOLERANCE) return -Infinity;
  return _sup.y;
}

/**
 * Advance a folk along a bridge span. It walks while the next centimetre is
 * supported, hops across short unsupported stretches, and otherwise waits.
 */
export function stepBridge(
  span: BridgeSpan,
  s: number,
  speed: number,
  dt: number,
  hands: readonly HandSample[],
  out: BridgeStep,
): BridgeStep {
  const L = spanLength(span);
  const here = bridgeSupport(span, s, hands);
  // Probe a little ahead for support, but only travel speed * dt.
  const next = Math.min(L, s + speed * dt);
  const ahead = bridgeSupport(span, Math.min(L, s + Math.max(speed * dt, 0.006)), hands);
  out.onHand = s > span.groundLength && s < L - span.groundLength;
  if (ahead > -Infinity) {
    out.s = next;
    out.y = ahead;
    out.blocked = false;
    out.onHand = next > span.groundLength && next < L - span.groundLength;
    return out;
  }
  // Look for something to hop to within reach.
  for (let d = 0.01; d <= HOP_REACH; d += 0.01) {
    const probe = Math.min(L, s + d);
    const y = bridgeSupport(span, probe, hands);
    if (y > -Infinity) {
      out.s = Math.min(L, s + speed * dt * 1.6);
      out.y = Math.max(here > -Infinity ? here : y, y) + 0.01;
      out.blocked = false;
      return out;
    }
  }
  out.s = s;
  out.y = here;
  out.blocked = true;
  return out;
}

/* ------------------------------------------------------------------------ */
/* Lift: the folk boards a hand at one pad and steps off at another.        */
/* ------------------------------------------------------------------------ */

export const BOARD_LOW = -0.06;
export const BOARD_HIGH = 0.11;
export const LAND_RADIUS = 0.08;
export const LAND_LOW = -0.04;
export const LAND_HIGH = 0.1;

/** Returns the supporting hand index and height if a hand is offered at pad. */
export function canBoard(
  pad: V3,
  hands: readonly HandSample[],
  out: SupportResult,
): boolean {
  supportAt(pad.x, pad.z, hands, out);
  if (out.hand < 0) return false;
  const dy = out.y - pad.y;
  return dy >= BOARD_LOW && dy <= BOARD_HIGH;
}

export function canLand(folk: V3, pad: V3): boolean {
  if (distXZ(folk, pad) > LAND_RADIUS) return false;
  const dy = folk.y - pad.y;
  return dy >= LAND_LOW && dy <= LAND_HIGH;
}

/* 4x4 helpers for riding on the wrist frame (column-major, like Three.js). */

export function invertRigid(m: Float32Array, out: Float32Array): Float32Array {
  // Rotation transpose, translation -R^T t
  const r00 = m[0], r10 = m[1], r20 = m[2];
  const r01 = m[4], r11 = m[5], r21 = m[6];
  const r02 = m[8], r12 = m[9], r22 = m[10];
  const tx = m[12], ty = m[13], tz = m[14];
  out[0] = r00; out[1] = r01; out[2] = r02; out[3] = 0;
  out[4] = r10; out[5] = r11; out[6] = r12; out[7] = 0;
  out[8] = r20; out[9] = r21; out[10] = r22; out[11] = 0;
  out[12] = -(r00 * tx + r10 * ty + r20 * tz);
  out[13] = -(r01 * tx + r11 * ty + r21 * tz);
  out[14] = -(r02 * tx + r12 * ty + r22 * tz);
  out[15] = 1;
  return out;
}

export function transformPoint(m: Float32Array, p: V3, out: V3): V3 {
  const { x, y, z } = p;
  out.x = m[0] * x + m[4] * y + m[8] * z + m[12];
  out.y = m[1] * x + m[5] * y + m[9] * z + m[13];
  out.z = m[2] * x + m[6] * y + m[10] * z + m[14];
  return out;
}

/* ------------------------------------------------------------------------ */
/* Placement: a pinched object snaps into a slot when released near it.     */
/* ------------------------------------------------------------------------ */

export const GRAB_RADIUS = 0.06;
export const SNAP_RADIUS = 0.075;

export function canSnap(obj: V3, slot: V3, radius = SNAP_RADIUS) {
  return dist3(obj, slot) <= radius;
}

/** Which present, pinching hand (if any) is close enough to grab `obj`. */
export function grabbingHand(
  hands: readonly HandSample[],
  obj: V3,
  radius = GRAB_RADIUS,
): number {
  let best = -1;
  let bestD = radius;
  for (let h = 0; h < hands.length; h++) {
    const hand = hands[h];
    if (!hand.present || !hand.pinching) continue;
    const d = dist3(hand.pinchPoint, obj);
    if (d <= bestD) {
      bestD = d;
      best = h;
    }
  }
  return best;
}

/* ------------------------------------------------------------------------ */
/* Path helpers                                                             */
/* ------------------------------------------------------------------------ */

export interface Polyline {
  points: V3[];
  lengths: number[];
  total: number;
}

export function polyline(points: V3[]): Polyline {
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1] + dist3(points[i - 1], points[i]));
  }
  return { points, lengths, total: lengths[lengths.length - 1] };
}

export function samplePolyline(line: Polyline, s: number, out: V3): V3 {
  const d = clamp(s, 0, line.total);
  const { points, lengths } = line;
  for (let i = 1; i < points.length; i++) {
    if (d <= lengths[i] || i === points.length - 1) {
      const seg = lengths[i] - lengths[i - 1] || 1;
      return lerpV3(out, points[i - 1], points[i], (d - lengths[i - 1]) / seg);
    }
  }
  return copyV3(out, points[points.length - 1]);
}

/** Rotate a point about +y by `angle` radians (zone frame -> island frame). */
export function rotY(p: V3, angle: number): V3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return v3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c);
}
