/**
 * A single lantern spirit: walks its route, waits for the player's help,
 * crosses hands, rides palms and finally settles by the great tree, where it
 * keeps watching (and cheering for) the player.
 *
 * Movement rules live in logic.ts. This file adds a small layer of procedural
 * "acting" on top: blinking, glances, noticing the hand, hesitation at a gap,
 * reacting to being carried, happy bounces, and the finale gathering.
 */
import { Group, MeshBasicMaterial, Object3D, Sprite, SpriteMaterial } from '@iwsdk/core';
import {
  BridgeStep,
  canBoard,
  canLand,
  copyV3,
  dist3,
  distXZ,
  HandSample,
  isPoking,
  palmSurface,
  lerpV3,
  samplePolyline,
  smoothstep,
  spanLength,
  stepBridge,
  SupportResult,
  V3,
  v3,
} from './logic.js';
import type { FolkPlan, Segment } from './levels.js';
import { folkMesh } from './scenery.js';

export type FolkState =
  | 'sleep'
  | 'waking'
  | 'walk'
  | 'wait'
  | 'bridge'
  | 'hover'
  | 'return'
  | 'hop-on'
  | 'ride'
  | 'hop-off'
  | 'seated'
  | 'gather'
  | 'thank';

export type HelpKind = 'bridge' | 'lift' | 'leaf' | null;

export interface FolkEvents {
  wake(f: Folk): void;
  step(f: Folk): void;
  hop(f: Folk): void;
  arrive(f: Folk): void;
  worry(f: Folk): void;
  cheer(f: Folk): void;
}

type Celebration = 'hop' | 'spin' | 'sway';

/** Small per-spirit differences so each one reads as an individual. */
interface Personality {
  blinkEvery: number;
  breathe: number;
  celebrate: Celebration;
  curiosity: number;
}

const PERSONALITIES: Personality[] = [
  { blinkEvery: 3.2, breathe: 2.4, celebrate: 'hop', curiosity: 1 },
  { blinkEvery: 2.4, breathe: 3.1, celebrate: 'spin', curiosity: 1.3 },
  { blinkEvery: 4.1, breathe: 2.0, celebrate: 'sway', curiosity: 0.8 },
  { blinkEvery: 2.9, breathe: 2.7, celebrate: 'hop', curiosity: 1.15 },
];

const WALK_SPEED = 0.042;
const FOLK_SCALE = 1.25;
const BRIDGE_SPEED = 0.036;
/** Hands closer than this get noticed (metres). */
const NOTICE_RADIUS = 0.2;
const MIDDLE_KNUCKLE = 11;

let nextPersonality = 0;

export class Folk {
  readonly root: Group;
  private body: Group;
  private lanternMat: MeshBasicMaterial;
  private glow: Sprite;
  private eyeMat: MeshBasicMaterial;
  private eyes: Object3D[];
  private personality: Personality;
  state: FolkState = 'sleep';
  /** Seconds spent waiting for help in the current segment. */
  waitTime = 0;
  help: HelpKind = null;
  private seg = 0;
  private s = 0;
  private pos = v3();
  private prev = v3();
  private t = 0;
  private stateTime = 0;
  private delayLeft: number;
  private hopFrom = v3();
  private hopTo = v3();
  private rideHand = -1;
  private sup: SupportResult = { y: 0, hand: -1 };
  private step: BridgeStep = { s: 0, y: 0, blocked: false, onHand: false };
  private stepClock = 0;
  private returnTarget = v3();
  private faceYaw = 0;
  private squash = 0;
  /** Body-only yaw offset used for glances (root keeps the walking heading). */
  private lookYaw = 0;
  private lean = 0;
  private blinkIn: number;
  private blinkT = 0;
  private glanceIn = 2;
  private glanceYaw = 0;
  private bounceLeft = 0;
  private bounceDur = 0;
  private spinLeft = 0;
  private glowPulse = 0;
  private velX = 0;
  private velZ = 0;
  private gatherTarget = v3();
  /** Where the viewer's head is (island-local), set every frame by the game. */
  readonly viewer = v3(0, 0.4, 0.6);
  /** Something interesting to watch (e.g. the spirit being helped), or null. */
  watch: V3 | null = null;
  /** Set by the level when a leaf bridge is in place. */
  leafPlaced = false;
  /** Centre of the folk, used for touch detection. */
  readonly touchPoint = v3();
  private tmp = v3();

  constructor(readonly plan: FolkPlan, parent: Object3D, private events: FolkEvents) {
    const m = folkMesh(plan.tint);
    this.root = m.root;
    // Slightly larger than "true" scale so the spirits read clearly at arm's length.
    this.root.scale.setScalar(FOLK_SCALE);
    this.body = m.body;
    this.lanternMat = m.lanternMat;
    this.glow = m.glow;
    this.eyeMat = m.eyeMat;
    this.eyes = m.body.children.filter((c) => (c as { material?: unknown }).material === m.eyeMat);
    this.personality = PERSONALITIES[nextPersonality++ % PERSONALITIES.length];
    this.blinkIn = this.personality.blinkEvery;
    parent.add(this.root);
    this.delayLeft = plan.delay;
    this.reset();
  }

  reset() {
    this.state = 'sleep';
    this.seg = 0;
    this.s = 0;
    this.waitTime = 0;
    this.help = null;
    this.leafPlaced = false;
    this.watch = null;
    this.bounceLeft = 0;
    this.spinLeft = 0;
    this.delayLeft = this.plan.delay;
    copyV3(this.pos, this.plan.start);
    copyV3(this.prev, this.plan.start);
    const first = this.plan.route[0];
    if (first.kind === 'walk' && first.line.points.length > 1) {
      const p1 = first.line.points[1];
      this.faceYaw = Math.atan2(p1.x - this.pos.x, p1.z - this.pos.z);
    }
    this.apply(0, []);
  }

  get position(): V3 {
    return this.pos;
  }

  get segment(): Segment | undefined {
    return this.plan.route[this.seg];
  }

  get isAwake() {
    return this.state !== 'sleep';
  }

  get isSeated() {
    return this.state === 'seated' || this.state === 'gather' || this.state === 'thank';
  }

  get isCarried() {
    return this.state === 'ride' || (this.state === 'bridge' && this.step.onHand);
  }

  private set(state: FolkState) {
    this.state = state;
    this.stateTime = 0;
  }

  /* --------------------------------------------------------- reactions -- */

  /** Celebrate (another spirit arrived, or the finale). */
  cheer(strength = 1) {
    this.glowPulse = Math.max(this.glowPulse, 0.8 * strength);
    switch (this.personality.celebrate) {
      case 'hop':
        this.bounce(2, 0.32);
        break;
      case 'spin':
        this.spinLeft = 0.7;
        this.bounce(1, 0.4);
        break;
      case 'sway':
        this.bounce(1, 0.45);
        this.squash = 0.2;
        break;
    }
  }

  private bounce(count: number, each: number) {
    this.bounceLeft = count * each;
    this.bounceDur = each;
  }

  /** Finale: walk to a spot around the tree and celebrate there. */
  gatherAt(p: V3) {
    if (!this.isSeated) return;
    copyV3(this.hopFrom, this.pos);
    copyV3(this.gatherTarget, p);
    this.set('gather');
  }

  /** Finale: walk toward the player and bow. */
  thankAt(p: V3) {
    if (!this.isSeated) return;
    copyV3(this.hopFrom, this.pos);
    copyV3(this.gatherTarget, p);
    this.set('thank');
  }

  /* ------------------------------------------------------------ update -- */

  update(dt: number, hands: readonly HandSample[]) {
    this.t += dt;
    this.stateTime += dt;
    copyV3(this.prev, this.pos);
    this.touchPoint.x = this.pos.x;
    this.touchPoint.y = this.pos.y + 0.022 * FOLK_SCALE;
    this.touchPoint.z = this.pos.z;

    switch (this.state) {
      case 'sleep':
        if (isPoking(hands, this.touchPoint)) {
          this.set('waking');
          this.bounce(1, 0.35);
          this.glowPulse = 1;
          this.events.wake(this);
        }
        break;
      case 'waking':
        if (this.stateTime > 1.1) {
          if (this.delayLeft > 0) this.delayLeft -= dt;
          else this.beginSegment();
        }
        break;
      case 'walk':
        this.updateWalk(dt);
        break;
      case 'wait':
      case 'bridge':
      case 'hover':
        this.updateBridgeOrLift(dt, hands);
        break;
      case 'return':
        this.updateReturn();
        break;
      case 'hop-on':
        this.updateHop(() => this.set('ride'));
        break;
      case 'ride':
        this.updateRide(dt, hands);
        break;
      case 'hop-off':
        this.updateHop(() => this.nextSegment());
        break;
      case 'gather':
      case 'thank': {
        const T = this.state === 'thank' ? 2.4 : 1.8;
        const u = smoothstep(Math.min(1, this.stateTime / T));
        lerpV3(this.pos, this.hopFrom, this.gatherTarget, u);
        this.pos.y += Math.abs(Math.sin(u * Math.PI * 4)) * 0.004 * (1 - u);
        if (this.stateTime > T && this.stateTime - dt <= T) this.cheer();
        break;
      }
      case 'seated':
        break;
    }
    this.apply(dt, hands);
  }

  private beginSegment() {
    const seg = this.segment;
    this.s = 0;
    this.waitTime = 0;
    if (!seg) {
      this.set('seated');
      copyV3(this.pos, this.plan.seat);
      this.help = null;
      this.bounce(3, 0.3);
      this.glowPulse = 1.2;
      this.events.arrive(this);
      return;
    }
    if (seg.kind === 'walk') this.set('walk');
    else this.set('wait');
  }

  private nextSegment() {
    this.seg++;
    this.beginSegment();
  }

  private updateWalk(dt: number) {
    const seg = this.segment;
    if (!seg || seg.kind !== 'walk') return this.nextSegment();
    this.s += WALK_SPEED * dt;
    samplePolyline(seg.line, this.s, this.pos);
    if (this.s >= seg.line.total) this.nextSegment();
  }

  private updateBridgeOrLift(dt: number, hands: readonly HandSample[]) {
    const seg = this.segment;
    if (!seg) return;
    if (seg.kind === 'lift') {
      this.help = 'lift';
      copyV3(this.pos, seg.from);
      this.waitTime += dt;
      // A short beat of hesitation makes boarding read as a decision.
      if (this.stateTime > 0.5 && canBoard(seg.from, hands, this.sup)) {
        this.rideHand = this.sup.hand;
        copyV3(this.hopFrom, this.pos);
        // Hop onto the middle of the palm (whichever way it faces).
        palmSurface(hands[this.rideHand], this.hopTo);
        this.keepAboveGround(this.hopTo, seg.from);
        this.help = null;
        this.events.hop(this);
        this.set('hop-on');
      }
      return;
    }
    if (seg.kind !== 'bridge') return;
    const span = seg.span;
    const L = spanLength(span);
    if (seg.leafSlot && this.leafPlaced) {
      this.help = null;
      this.s = Math.min(L, this.s + BRIDGE_SPEED * dt);
      lerpV3(this.pos, span.from, span.to, this.s / L);
      this.pos.y += Math.sin((this.s / L) * Math.PI) * 0.006;
      if (this.state !== 'bridge') this.set('bridge');
      this.tickSteps(dt, false);
      if (this.s >= L - 1e-4) this.nextSegment();
      return;
    }
    stepBridge(span, this.s, BRIDGE_SPEED, dt, hands, this.step);
    // Hesitate briefly at the edge even once a hand appears.
    const hesitating = this.state === 'wait' && this.stateTime < 0.6;
    if (!this.step.blocked && !hesitating) {
      if (this.state === 'wait') this.bounce(1, 0.28); // a little hop of courage
      if (this.state !== 'bridge') this.set('bridge');
      this.help = null;
      this.s = this.step.s;
      lerpV3(this.pos, span.from, span.to, this.s / L);
      // Smoothly settle onto the hand surface (filters tracking jitter).
      const k = Math.min(1, dt * 18);
      this.pos.y = this.prev.y + (this.step.y - this.prev.y) * k;
      this.tickSteps(dt, this.step.onHand);
      if (this.s >= L - 1e-4) {
        this.pos.y = span.to.y;
        this.nextSegment();
      }
      return;
    }
    const onGround = this.s <= span.groundLength + 1e-4;
    if (onGround) {
      if (this.state !== 'wait') this.set('wait');
      this.help = seg.leafSlot ? 'leaf' : 'bridge';
      this.waitTime += dt;
      lerpV3(this.pos, span.from, span.to, this.s / L);
      return;
    }
    // Mid-gap with the hand gone: spirits can hover briefly, then drift back.
    if (this.state !== 'hover') {
      this.set('hover');
      this.events.worry(this);
    }
    this.pos.y = this.prev.y + Math.sin(this.t * 6) * 0.0004;
    if (this.stateTime > 2.6) {
      copyV3(this.returnTarget, span.from);
      copyV3(this.hopFrom, this.pos);
      this.set('return');
    }
  }

  private updateReturn() {
    const seg = this.segment;
    const T = 1.4;
    const u = smoothstep(this.stateTime / T);
    lerpV3(this.pos, this.hopFrom, this.returnTarget, u);
    this.pos.y += Math.sin(u * Math.PI) * 0.02;
    if (this.stateTime >= T) {
      copyV3(this.pos, this.returnTarget);
      if (seg?.kind === 'lift' && dist3(this.returnTarget, seg.to) < 1e-6) {
        this.nextSegment();
        return;
      }
      this.s = 0;
      this.set('wait');
    }
  }

  private updateHop(done: () => void) {
    const T = 0.38;
    const u = Math.min(1, this.stateTime / T);
    lerpV3(this.pos, this.hopFrom, this.hopTo, u);
    this.pos.y += Math.sin(u * Math.PI) * 0.022;
    this.squash = Math.sin(u * Math.PI) * -0.15;
    if (u >= 1) {
      this.squash = 0.18;
      done();
    }
  }

  private updateRide(dt: number, hands: readonly HandSample[]) {
    const seg = this.segment;
    if (!seg || seg.kind !== 'lift') return;
    const hand = hands[this.rideHand];
    if (!hand || !hand.present) {
      // Tracking lost: hold position and glow worried; float to safety after a moment.
      this.waitTime += dt;
      this.help = this.waitTime > 0.3 ? 'lift' : null;
      if (this.waitTime > 1.2) {
        const toGoal = dist3(this.pos, seg.to) < dist3(this.pos, seg.from) && dist3(this.pos, seg.to) < 0.1;
        copyV3(this.returnTarget, toGoal ? seg.to : seg.from);
        copyV3(this.hopFrom, this.pos);
        this.set('return');
      }
      return;
    }
    this.waitTime = 0;
    this.help = null;
    palmSurface(hand, this.hopTo);
    this.keepAboveGround(this.hopTo, seg.from);
    const k = Math.min(1, dt * 22);
    lerpV3(this.pos, this.pos, this.hopTo, k);
    this.tickSteps(dt, false);
    if (canLand(this.pos, seg.to)) {
      copyV3(this.hopFrom, this.pos);
      copyV3(this.hopTo, seg.to);
      this.events.hop(this);
      this.set('hop-off');
    }
  }

  /** A rider never sinks into the island it is leaving (hands can pass through scenery). */
  private keepAboveGround(p: V3, pad: V3) {
    if (distXZ(p, pad) < 0.075 && p.y < pad.y) p.y = pad.y;
  }

  private tickSteps(dt: number, audible: boolean) {
    this.stepClock += dt;
    if (this.stepClock > 0.26) {
      this.stepClock = 0;
      if (audible) this.events.step(this);
    }
  }

  /* ------------------------------------------------------------ acting -- */

  /** Nearest tracked hand (middle knuckle) within reach, written into `out`. */
  private nearestHand(hands: readonly HandSample[], out: V3): number {
    let best = Infinity;
    for (const h of hands) {
      if (!h.present) continue;
      const j = h.joints;
      const x = j[MIDDLE_KNUCKLE * 3];
      const y = j[MIDDLE_KNUCKLE * 3 + 1];
      const z = j[MIDDLE_KNUCKLE * 3 + 2];
      const d = Math.hypot(x - this.pos.x, y - this.pos.y, z - this.pos.z);
      if (d < best) {
        best = d;
        out.x = x;
        out.y = y;
        out.z = z;
      }
    }
    return best;
  }

  private yawTo(p: V3) {
    return Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
  }

  private chooseLook(dt: number, hands: readonly HandSample[]): number | null {
    const handDist = this.nearestHand(hands, this.tmp);
    const sees = handDist < NOTICE_RADIUS * this.personality.curiosity;
    switch (this.state) {
      case 'sleep':
        // Half asleep, it still turns toward a hand that comes close.
        return handDist < 0.28 ? this.yawTo(this.tmp) : null;
      case 'walk':
        return sees ? this.yawTo(this.tmp) : null;
      case 'wait': {
        // Hesitate: look across the gap, then back at the hand / the player.
        const seg = this.segment;
        const phase = Math.floor(this.stateTime / 1.3) % 2;
        if (phase === 0 && seg && seg.kind === 'bridge') return this.yawTo(seg.span.to);
        if (phase === 0 && seg && seg.kind === 'lift') return this.yawTo(seg.to);
        return sees ? this.yawTo(this.tmp) : this.yawTo(this.viewer);
      }
      case 'ride':
      case 'hop-on':
        return this.yawTo(this.viewer);
      case 'hover':
        return sees ? this.yawTo(this.tmp) : this.yawTo(this.viewer);
      case 'seated':
      case 'gather':
        // Remembers you: watch your hand when it's near, otherwise the spirit you're helping, otherwise you.
        if (handDist < 0.3) return this.yawTo(this.tmp);
        if (this.watch) return this.yawTo(this.watch);
        return this.yawTo(this.viewer);
      case 'thank':
        return this.yawTo(this.viewer);
      default:
        void dt;
        return null;
    }
  }

  /** Push simulated state to the meshes. */
  private apply(dt: number, hands: readonly HandSample[]) {
    const r = this.root;
    r.position.set(this.pos.x, this.pos.y, this.pos.z);
    const dx = this.pos.x - this.prev.x;
    const dz = this.pos.z - this.prev.z;
    const moving = dx * dx + dz * dz > 1e-9;
    if (dt > 0) {
      this.velX += (dx / dt - this.velX) * Math.min(1, dt * 10);
      this.velZ += (dz / dt - this.velZ) * Math.min(1, dt * 10);
    }
    // Root heading follows travel direction (not while riding or hovering).
    if (moving && this.state !== 'ride' && this.state !== 'hover' && this.state !== 'hop-on') {
      this.turnRoot(Math.atan2(dx, dz), dt * 10);
    }

    // Glances and attention (body only, clamped so it never looks unnatural).
    const want = this.chooseLook(dt, hands);
    this.glanceIn -= dt;
    if (this.glanceIn <= 0) {
      this.glanceIn = 1.8 + Math.random() * 2.5;
      this.glanceYaw = (Math.random() - 0.5) * 1.1;
    }
    let targetOffset = 0;
    if (want !== null) {
      targetOffset = wrap(want - this.faceYaw);
      if (this.isSeated || this.state === 'wait') {
        // Turn the whole body when standing still.
        this.turnRoot(want, dt * 3);
        targetOffset = wrap(want - this.faceYaw);
      }
    } else if (this.state !== 'sleep') {
      targetOffset = this.glanceYaw * 0.5;
    }
    targetOffset = Math.max(-1.2, Math.min(1.2, targetOffset));
    this.lookYaw += (targetOffset - this.lookYaw) * Math.min(1, dt * 5);
    r.rotation.y = this.faceYaw;

    const b = this.body;
    const walking = this.state === 'walk' || this.state === 'bridge' || this.state === 'gather' || this.state === 'thank';
    const sleeping = this.state === 'sleep';
    // Lean toward a hand that comes close; bow when thanking.
    const handDist = this.nearestHand(hands, this.tmp);
    let leanTarget = handDist < 0.09 && !sleeping ? -0.18 : 0;
    if (this.state === 'thank' && this.stateTime > 2.4) leanTarget = 0.45 * Math.max(0, Math.sin((this.stateTime - 2.4) * 2.2));
    if (sleeping) leanTarget = 0.35;
    if (this.state === 'wait') leanTarget = -0.06;
    // Being carried: sway against the hand's motion.
    let tiltX = 0;
    let tiltZ = 0;
    if (this.state === 'ride') {
      tiltX = Math.max(-0.35, Math.min(0.35, this.velZ * 3));
      tiltZ = Math.max(-0.35, Math.min(0.35, -this.velX * 3));
    }
    this.lean += (leanTarget - this.lean) * Math.min(1, dt * 6);

    // Bounces and spins.
    let hop = 0;
    if (this.bounceLeft > 0) {
      this.bounceLeft -= dt;
      const ph = (this.bounceLeft % this.bounceDur) / this.bounceDur;
      hop = Math.sin(ph * Math.PI) * 0.012;
    }
    let spin = 0;
    if (this.spinLeft > 0) {
      this.spinLeft -= dt;
      spin = (1 - this.spinLeft / 0.7) * Math.PI * 2;
    }
    this.squash += (0 - this.squash) * Math.min(1, dt * 8);
    const p = this.personality;
    const bob = walking ? Math.abs(Math.sin(this.t * 14)) * 0.0025 : 0;
    const breathe = Math.sin(this.t * (sleeping ? 1.6 : p.breathe)) * (sleeping ? 0.05 : 0.025);
    const riding = this.state === 'ride' ? Math.sin(this.t * 4) * 0.0015 : 0;
    b.position.y = bob + hop + riding + (this.state === 'hover' ? 0.004 + Math.sin(this.t * 5) * 0.002 : 0);
    b.rotation.set(
      this.lean + tiltX,
      this.lookYaw + spin,
      (walking ? Math.sin(this.t * 7) * 0.08 : 0) + tiltZ + (p.celebrate === 'sway' && hop > 0 ? Math.sin(this.t * 12) * 0.2 : 0),
    );
    const sy = 1 + breathe - this.squash;
    b.scale.set(1 + this.squash * 0.5, sleeping ? sy * 0.88 : sy, 1 + this.squash * 0.5);

    // Blinking (sleeping spirits keep their eyes closed).
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkT = 0.13;
      this.blinkIn = p.blinkEvery * (0.6 + Math.random() * 0.8);
    }
    this.blinkT = Math.max(0, this.blinkT - dt);
    const eyeOpen = sleeping ? 0.15 : this.blinkT > 0 ? 0.15 : 1;
    for (const e of this.eyes) e.scale.y = 1.3 * eyeOpen;

    // Lantern: dim asleep, bright awake, pulsing when it needs help, flaring on joy.
    this.glowPulse = Math.max(0, this.glowPulse - dt * 0.9);
    const need = this.help ? 0.5 + 0.5 * Math.sin(this.t * 5) : 0;
    const flicker = 0.04 * Math.sin(this.t * 7.3 + p.blinkEvery) * Math.sin(this.t * 3.1);
    const stir = sleeping && handDist < 0.12 ? 0.25 : 0;
    const bright = sleeping
      ? 0.25 + 0.08 * Math.sin(this.t * 1.6) + stir
      : 0.85 + need * 0.35 + flicker + this.glowPulse * 0.6;
    (this.glow.material as SpriteMaterial).opacity = Math.min(1, bright);
    const s = 0.05 + bright * 0.035 + (this.isSeated ? 0.015 : 0) + this.glowPulse * 0.03;
    this.glow.scale.set(s, s, s);
    this.lanternMat.color.setHex(this.plan.tint).multiplyScalar(sleeping ? 0.45 + stir : 1);
    this.eyeMat.color.setHex(sleeping ? 0x2a2645 : 0xfff6d8);
  }

  private turnRoot(target: number, k: number) {
    this.faceYaw += wrap(target - this.faceYaw) * Math.min(1, k);
  }
}

function wrap(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
