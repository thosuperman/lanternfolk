/**
 * Level layouts. Each "zone" is authored in its own frame (+z points toward
 * the player while that zone is active) and rotated into island space.
 */
import { BridgeSpan, polyline, Polyline, rotY, V3, v3 } from './logic.js';

export type Segment =
  | { kind: 'walk'; line: Polyline }
  | { kind: 'bridge'; span: BridgeSpan; leafSlot?: boolean }
  | { kind: 'lift'; from: V3; to: V3 };

export interface FolkPlan {
  start: V3;
  route: Segment[];
  seat: V3;
  tint: number;
  delay: number;
}

export interface IsletPlan {
  center: V3;
  radius: number;
  depth: number;
  seed: number;
}

export type Mechanic = 'bridge' | 'lift' | 'leaf';

export interface LevelPlan {
  id: number;
  name: string;
  mechanic: Mechanic;
  /** Zone yaw on the island (radians). */
  angle: number;
  islet: IsletPlan;
  folk: FolkPlan[];
  /** Lantern posts along the route. */
  lanterns: V3[];
  /** Where to show the hand-shaped hint. */
  hint: V3;
  /** Lift hint end point (hint animates from hint -> hintTo). */
  hintTo?: V3;
  /** Leaf start position and its slot (leaf levels only). */
  leafStart?: V3;
  leafSlot?: V3;
  /** Where the instruction label floats. */
  label: V3;
  intro: [string, string];
  help: [string, string];
}

export const CENTRAL_RADIUS = 0.13;
export const SOCKET = v3(0, 0.275, 0);

function zone(angle: number) {
  const P = (x: number, y: number, z: number) => rotY(v3(x, y, z), angle);
  return P;
}

function makeLevel1(): LevelPlan {
  const a = 0;
  const P = zone(a);
  return {
    id: 1,
    name: 'Lend a Hand',
    mechanic: 'bridge',
    angle: a,
    islet: { center: P(0, 0, 0.27), radius: 0.066, depth: 0.09, seed: 11 },
    folk: [
      {
        start: P(0.018, 0, 0.305),
        route: [
          { kind: 'walk', line: polyline([P(0.018, 0, 0.305), P(0.004, 0, 0.262), P(0, 0, 0.215)]) },
          { kind: 'bridge', span: { from: P(0, 0, 0.215), to: P(0, 0, 0.118), groundLength: 0.012 } },
          { kind: 'walk', line: polyline([P(0, 0, 0.118), P(0.004, 0, 0.068)]) },
        ],
        seat: P(0.004, 0, 0.062),
        tint: 0xffc861,
        delay: 0,
      },
    ],
    lanterns: [P(0.03, 0, 0.24), P(0.026, 0, 0.1)],
    hint: P(0, 0.015, 0.168),
    label: P(0, 0.16, 0.27),
    intro: ['Wake me', 'Touch the little light with one finger'],
    help: ['Lend me a hand', 'Hold your palm across the gap'],
  };
}

function makeLevel2(): LevelPlan {
  const a = (Math.PI * 2) / 3;
  const P = zone(a);
  const low = -0.12;
  return {
    id: 2,
    name: 'Up We Go',
    mechanic: 'lift',
    angle: a,
    islet: { center: P(0, low, 0.27), radius: 0.068, depth: 0.08, seed: 23 },
    folk: [
      {
        start: P(-0.02, low, 0.31),
        route: [
          { kind: 'walk', line: polyline([P(-0.02, low, 0.31), P(-0.006, low, 0.27), P(0, low, 0.238)]) },
          { kind: 'lift', from: P(0, low, 0.238), to: P(0, 0, 0.112) },
          { kind: 'walk', line: polyline([P(0, 0, 0.112), P(-0.004, 0, 0.068)]) },
        ],
        seat: P(-0.004, 0, 0.062),
        tint: 0x8fe3ff,
        delay: 0,
      },
    ],
    lanterns: [P(0.03, low, 0.25), P(0.028, 0, 0.1)],
    hint: P(0, low + 0.01, 0.238),
    hintTo: P(0, 0.01, 0.112),
    label: P(0, 0.16, 0.27),
    intro: ['Down here!', 'A gentle touch will wake me'],
    help: ['Lift me higher', 'Let me climb on, then raise your palm to the ledge'],
  };
}

function makeLevel3(): LevelPlan {
  const a = (Math.PI * 4) / 3;
  const P = zone(a);
  const span = (x: number): BridgeSpan => ({ from: P(x, 0, 0.228), to: P(x, 0, 0.12), groundLength: 0.012 });
  return {
    id: 3,
    name: 'Together',
    mechanic: 'leaf',
    angle: a,
    islet: { center: P(0, 0, 0.292), radius: 0.07, depth: 0.1, seed: 37 },
    folk: [
      {
        start: P(-0.022, 0, 0.32),
        route: [
          { kind: 'walk', line: polyline([P(-0.022, 0, 0.32), P(-0.004, 0, 0.27), P(0, 0, 0.228)]) },
          { kind: 'bridge', span: span(0), leafSlot: true },
          { kind: 'walk', line: polyline([P(0, 0, 0.12), P(-0.012, 0, 0.07)]) },
        ],
        seat: P(-0.014, 0, 0.064),
        tint: 0xff9ec7,
        delay: 0,
      },
      {
        start: P(0.024, 0, 0.318),
        route: [
          { kind: 'walk', line: polyline([P(0.024, 0, 0.318), P(0.006, 0, 0.28), P(0, 0, 0.228)]) },
          { kind: 'bridge', span: span(0), leafSlot: true },
          { kind: 'walk', line: polyline([P(0, 0, 0.12), P(0.012, 0, 0.07)]) },
        ],
        seat: P(0.014, 0, 0.064),
        tint: 0xc6a2ff,
        delay: 1.6,
      },
    ],
    lanterns: [P(-0.034, 0, 0.26), P(0.03, 0, 0.1)],
    hint: P(0.105, 0.035, 0.2),
    leafStart: P(0.105, 0.035, 0.2),
    leafSlot: P(0, 0.002, 0.174),
    label: P(0, 0.16, 0.29),
    intro: ['Wake us both', 'Two little lights, one gap'],
    help: ['Help us home', 'Pinch the glowing leaf and lay it across'],
  };
}

export const LEVELS: LevelPlan[] = [makeLevel1(), makeLevel2(), makeLevel3()];

/** Where the star waits for the finale (in level 3's zone, right of the tree). */
export const STAR_START = rotY(v3(-0.085, 0.07, 0.13), (Math.PI * 4) / 3);
