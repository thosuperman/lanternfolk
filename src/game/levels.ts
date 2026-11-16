/**
 * Level layouts. Each "zone" is authored in its own frame (+z points toward
 * the player while that zone is active) and rotated into island space.
 *
 *  1. The Moonlit Crossing  — two palm bridges (a short gap, then a wider one); balance matters.
 *  2. The Rising Lanterns   — a two-stage palm lift past swinging branches.
 *  3. The Starlight Reunion — a pinched leaf bridge for two friends, then carry the star on your palm.
 */
import { BridgeSpan, polyline, Polyline, rotY, V3, v3 } from './logic.js';

export type Personality = 'shy' | 'playful' | 'brave' | 'gentle';
export type Mood = 'calm' | 'playful' | 'mysterious';

export type Segment =
  | { kind: 'walk'; line: Polyline }
  | { kind: 'bridge'; span: BridgeSpan; leafSlot?: boolean; help?: [string, string] }
  | { kind: 'lift'; from: V3; to: V3; landRadius?: number; help?: [string, string] };

export interface FolkPlan {
  start: V3;
  route: Segment[];
  seat: V3;
  tint: number;
  delay: number;
  personality: Personality;
}

export interface IsletPlan {
  center: V3;
  radius: number;
  depth: number;
  seed: number;
}

/** A floating branch that swings along `swing` (a capsule from a to b). */
export interface ObstaclePlan {
  a: V3;
  b: V3;
  radius: number;
  swing: V3;
  period: number;
  phase: number;
}

export interface StarPlan {
  /** Centre of the star islet's slow drift loop. */
  center: V3;
  /** Drift amplitude (x, y, z) and period (s). */
  drift: V3;
  period: number;
}

export interface Atmosphere {
  skyTop: number;
  skyBottom: number;
  hemi: number;
  particles: 'fireflies' | 'lanterns' | 'stars';
}

export interface LevelPlan {
  id: number;
  name: string;
  theme: string;
  mechanic: 'bridge' | 'lift' | 'leaf';
  mood: Mood;
  atmosphere: Atmosphere;
  /** Zone yaw on the island (radians). */
  angle: number;
  islets: IsletPlan[];
  folk: FolkPlan[];
  lanterns: V3[];
  obstacles: ObstaclePlan[];
  leafStart?: V3;
  leafSlot?: V3;
  star?: StarPlan;
  /** Where the instruction label floats. */
  label: V3;
  intro: [string, string];
  help: Record<'bridge' | 'lift' | 'leaf', [string, string]>;
}

export const CENTRAL_RADIUS = 0.13;
export const SOCKET = v3(0, 0.275, 0);

function zone(angle: number) {
  return (x: number, y: number, z: number) => rotY(v3(x, y, z), angle);
}

/** A bridge between two round islands, starting/ending 8 mm inside their rims. */
function edgeSpan(c1: V3, r1: number, c2: V3, r2: number): BridgeSpan {
  const dx = c2.x - c1.x;
  const dz = c2.z - c1.z;
  const d = Math.hypot(dx, dz);
  const ux = dx / d;
  const uz = dz / d;
  return {
    from: v3(c1.x + ux * (r1 - 0.008), c1.y, c1.z + uz * (r1 - 0.008)),
    to: v3(c2.x - ux * (r2 - 0.008), c2.y, c2.z - uz * (r2 - 0.008)),
    groundLength: 0.012,
  };
}

const HELP_DEFAULT: LevelPlan['help'] = {
  bridge: ['Lend me a hand', 'Hold your palm flat across the gap'],
  lift: ['Lift me higher', 'Let me climb on, then raise your palm'],
  leaf: ['Help us home', 'Pinch the glowing leaf and lay it across'],
};

/* ------------------------------------------------------- 1. Moonlit Crossing */
function makeLevel1(): LevelPlan {
  const a = 0;
  const P = zone(a);
  const o1 = P(0.13, 0, 0.33);
  const s1 = P(-0.02, 0, 0.27);
  const main = P(0, 0, 0);
  const span1 = edgeSpan(o1, 0.05, s1, 0.036);
  const span2 = edgeSpan(s1, 0.036, main, CENTRAL_RADIUS);
  return {
    id: 1,
    name: 'The Moonlit Crossing',
    theme: 'Trust',
    mechanic: 'bridge',
    mood: 'calm',
    atmosphere: { skyTop: 0x070a26, skyBottom: 0x1a1f4d, hemi: 0x9fb2ff, particles: 'fireflies' },
    angle: a,
    islets: [
      { center: o1, radius: 0.05, depth: 0.08, seed: 11 },
      { center: s1, radius: 0.036, depth: 0.06, seed: 12 },
    ],
    folk: [
      {
        start: P(0.155, 0, 0.35),
        route: [
          { kind: 'walk', line: polyline([P(0.155, 0, 0.35), P(0.13, 0, 0.33), span1.from]) },
          { kind: 'bridge', span: span1 },
          { kind: 'walk', line: polyline([span1.to, s1, span2.from]) },
          { kind: 'bridge', span: span2, help: ['Steady now', 'A wider gap: keep your palm flat and still'] },
          { kind: 'walk', line: polyline([span2.to, P(0.004, 0, 0.068)]) },
        ],
        seat: P(0.004, 0, 0.062),
        tint: 0xffc861,
        delay: 0,
        personality: 'shy',
      },
    ],
    lanterns: [P(0.15, 0, 0.3), P(-0.03, 0, 0.255), P(0.03, 0, 0.1)],
    obstacles: [],
    label: P(0.06, 0.2, 0.3),
    intro: ['Wake me', 'Touch the little light with one finger'],
    help: HELP_DEFAULT,
  };
}

/* ------------------------------------------------------- 2. Rising Lanterns */
function makeLevel2(): LevelPlan {
  const a = (Math.PI * 2) / 3;
  const P = zone(a);
  const low = -0.15;
  const mid = -0.07;
  return {
    id: 2,
    name: 'The Rising Lanterns',
    theme: 'Courage',
    mechanic: 'lift',
    mood: 'playful',
    atmosphere: { skyTop: 0x0b0b2a, skyBottom: 0x3a2350, hemi: 0xffc9a8, particles: 'lanterns' },
    angle: a,
    islets: [
      { center: P(-0.01, low, 0.3), radius: 0.06, depth: 0.08, seed: 23 },
      { center: P(0.1, mid, 0.21), radius: 0.042, depth: 0.07, seed: 24 },
    ],
    folk: [
      {
        start: P(-0.03, low, 0.33),
        route: [
          { kind: 'walk', line: polyline([P(-0.03, low, 0.33), P(-0.012, low, 0.295), P(0.0, low, 0.27)]) },
          { kind: 'lift', from: P(0.0, low, 0.27), to: P(0.095, mid, 0.215), landRadius: 0.065 },
          { kind: 'walk', line: polyline([P(0.095, mid, 0.215), P(0.085, mid, 0.195)]) },
          {
            kind: 'lift',
            from: P(0.085, mid, 0.195),
            to: P(0.04, 0, 0.112),
            landRadius: 0.07,
            help: ['Mind the branches', 'Lift me to the top, between the swings'],
          },
          { kind: 'walk', line: polyline([P(0.04, 0, 0.112), P(-0.004, 0, 0.068)]) },
        ],
        seat: P(-0.004, 0, 0.062),
        tint: 0x8fe3ff,
        delay: 0,
        personality: 'playful',
      },
    ],
    lanterns: [P(0.03, low, 0.27), P(0.12, mid, 0.2), P(0.05, 0, 0.1)],
    obstacles: [
      // between the low islet and the mid ledge
      { a: P(0.02, -0.11, 0.21), b: P(0.07, -0.11, 0.28), radius: 0.012, swing: P(0.03, 0.0, 0.0), period: 5.5, phase: 0 },
      // between the mid ledge and the top
      // crosses the direct diagonal; going up beside the ledge, over and down stays clear
      { a: P(0.08, -0.025, 0.128), b: P(0.031, -0.025, 0.155), radius: 0.012, swing: P(-0.007, 0.0, -0.013), period: 4.5, phase: 1.6 },
    ],
    label: P(0.04, 0.2, 0.3),
    intro: ['Down here!', 'A gentle touch will wake me'],
    help: HELP_DEFAULT,
  };
}

/* ------------------------------------------------------- 3. Starlight Reunion */
function makeLevel3(): LevelPlan {
  const a = (Math.PI * 4) / 3;
  const P = zone(a);
  const span = (x: number): BridgeSpan => ({ from: P(x, 0, 0.228), to: P(x, 0, 0.12), groundLength: 0.012 });
  return {
    id: 3,
    name: 'The Starlight Reunion',
    theme: 'Friendship',
    mechanic: 'leaf',
    mood: 'mysterious',
    atmosphere: { skyTop: 0x050722, skyBottom: 0x1d2a55, hemi: 0xb7c4ff, particles: 'stars' },
    angle: a,
    islets: [{ center: P(0, 0, 0.292), radius: 0.07, depth: 0.1, seed: 37 }],
    folk: [
      {
        start: P(0.024, 0, 0.318),
        route: [
          { kind: 'walk', line: polyline([P(0.024, 0, 0.318), P(0.006, 0, 0.28), P(0, 0, 0.228)]) },
          { kind: 'bridge', span: span(0), leafSlot: true },
          { kind: 'walk', line: polyline([P(0, 0, 0.12), P(0.012, 0, 0.07)]) },
        ],
        seat: P(0.014, 0, 0.064),
        tint: 0xc6a2ff,
        delay: 0,
        personality: 'brave',
      },
      {
        start: P(-0.022, 0, 0.32),
        route: [
          { kind: 'walk', line: polyline([P(-0.022, 0, 0.32), P(-0.004, 0, 0.27), P(0, 0, 0.228)]) },
          { kind: 'bridge', span: span(0), leafSlot: true },
          { kind: 'walk', line: polyline([P(0, 0, 0.12), P(-0.012, 0, 0.07)]) },
        ],
        seat: P(-0.014, 0, 0.064),
        tint: 0xff9ec7,
        delay: 1.6,
        personality: 'gentle',
      },
    ],
    lanterns: [P(-0.034, 0, 0.26), P(0.03, 0, 0.1)],
    obstacles: [],
    leafStart: P(0.105, 0.035, 0.2),
    leafSlot: P(0, 0.002, 0.174),
    star: { center: P(-0.13, 0.06, 0.2), drift: v3(0.035, 0.015, 0.03), period: 18 },
    label: P(0, 0.2, 0.29),
    intro: ['Wake us both', 'Two little lights, one gap'],
    help: HELP_DEFAULT,
  };
}

export const LEVELS: LevelPlan[] = [makeLevel1(), makeLevel2(), makeLevel3()];

/** Star position at time t on its drifting islet (island-local). */
export function starIsletAt(star: StarPlan, t: number, out: V3): V3 {
  const w = (Math.PI * 2) / star.period;
  out.x = star.center.x + Math.sin(t * w) * star.drift.x;
  out.y = star.center.y + Math.sin(t * w * 2) * star.drift.y;
  out.z = star.center.z + Math.cos(t * w) * star.drift.z;
  return out;
}

/** Obstacle capsule endpoints at time t. */
export function obstacleAt(o: ObstaclePlan, t: number, a: V3, b: V3) {
  const k = Math.sin((t / o.period) * Math.PI * 2 + o.phase);
  a.x = o.a.x + o.swing.x * k;
  a.y = o.a.y + o.swing.y * k;
  a.z = o.a.z + o.swing.z * k;
  b.x = o.b.x + o.swing.x * k;
  b.y = o.b.y + o.swing.y * k;
  b.z = o.b.z + o.swing.z * k;
}

/** Distance from point p to segment ab. */
export function distToSegment(p: V3, a: V3, b: V3): number {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2));
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t), p.z - (a.z + abz * t));
}
