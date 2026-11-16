/**
 * A single lantern spirit: walks its route, waits for the player's help,
 * crosses hands, rides palms and finally settles by the great tree, where it
 * keeps watching (and cheering for) the player.
 *
 * Movement rules live in logic.ts. On top of them this file adds:
 *  - balance: a spirit on a hand wobbles if the palm tilts or moves too fast,
 *    and slips back to its last safe spot (a checkpoint) when balance runs out;
 *  - obstacles: touching a swinging branch while riding knocks it back too;
 *  - an emotion layer (sleepy, curious, nervous, scared, surprised, dizzy,
 *    determined, excited, happy, grateful, celebrating) chosen from context,
 *    shaped by a personality (shy, playful, brave, gentle).
 */
import { Group, Mesh, MeshBasicMaterial, Object3D, Sprite, SpriteMaterial } from '@iwsdk/core';
import {
  BridgeStep,
  canBoard,
  canLand,
  copyV3,
  dist3,
  distXZ,
  HandSample,
  isPoking,
  lerpV3,
  palmSurface,
  samplePolyline,
  smoothstep,
  spanLength,
  stepBridge,
  SupportResult,
  updateBalance,
  V3,
  v3,
} from './logic.js';
import { distToSegment, FolkPlan, Personality, Segment } from './levels.js';
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

export type Emotion =
  | 'sleepy'
  | 'curious'
  | 'happy'
  | 'excited'
  | 'nervous'
  | 'scared'
  | 'surprised'
  | 'dizzy'
  | 'determined'
  | 'grateful'
  | 'celebrating';

export type HelpKind = 'bridge' | 'lift' | 'leaf' | null;

export interface FolkEvents {
  wake(f: Folk): void;
  step(f: Folk): void;
  hop(f: Folk): void;
  arrive(f: Folk): void;
  worry(f: Folk): void;
  cheer(f: Folk): void;
  /** Lost balance (or bumped a branch) and is floating back to a checkpoint. */
  slip(f: Folk, reason: 'balance' | 'branch' | 'tracking'): void;
}

/** A capsule the spirit must not touch while riding (island-local). */
export interface Obstacle {
  a: V3;
  b: V3;
  radius: number;
}

type Celebration = 'hop' | 'spin' | 'sway';

interface Traits {
  blinkEvery: number;
  breathe: number;
  celebrate: Celebration;
  /** How far it notices hands. */
  curiosity: number;
  /** Seconds it hesitates before trusting a hand. */
  hesitate: number;
  /** How much it trembles when nervous. */
  tremble: number;
  /** Emotion while waiting for help. */
  waiting: Emotion;
  /** Emotion while being carried and steady. */
  carried: Emotion;
}

const TRAITS: Record<Personality, Traits> = {
  shy: { blinkEvery: 3.6, breathe: 2.0, celebrate: 'hop', curiosity: 0.85, hesitate: 1.0, tremble: 1.3, waiting: 'nervous', carried: 'nervous' },
  playful: { blinkEvery: 2.4, breathe: 3.1, celebrate: 'spin', curiosity: 1.4, hesitate: 0.35, tremble: 0.8, waiting: 'curious', carried: 'excited' },
  brave: { blinkEvery: 3.2, breathe: 2.6, celebrate: 'hop', curiosity: 1.2, hesitate: 0.2, tremble: 0.5, waiting: 'determined', carried: 'determined' },
  gentle: { blinkEvery: 4.1, breathe: 2.0, celebrate: 'sway', curiosity: 1.0, hesitate: 0.7, tremble: 1.0, waiting: 'curious', carried: 'happy' },
};

const WALK_SPEED = 0.042;
const BRIDGE_SPEED = 0.036;
const FOLK_SCALE = 1.25;
/** Hands closer than this get noticed (metres). */
const NOTICE_RADIUS = 0.2;
const MIDDLE_KNUCKLE = 11;
/** Body radius used for branch collisions. */
const BODY_RADIUS = 0.016;

export class Folk {
  readonly root: Group;
  private body: Group;
  private arm: Group;
  private lanternMat: MeshBasicMaterial;
  private glow: Sprite;
  private eyeMat: MeshBasicMaterial;
  private eyes: Mesh[];
  private dizzyStars: Group;
  readonly traits: Traits;
  state: FolkState = 'sleep';
  emotion: Emotion = 'sleepy';
  /** 0..1; 1 = perfectly steady. */
  balance = 1;
  /** Seconds spent waiting for help in the current segment. */
  waitTime = 0;
  help: HelpKind = null;
  /** Number of slips so far in this run (for encouragement). */
  slips = 0;
  lastSlip = '';
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
  private step: BridgeStep = { s: 0, y: 0, blocked: false, onHand: false, hand: -1 };
  private stepClock = 0;
  private returnTarget = v3();
  private faceYaw = 0;
  private squash = 0;
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
  /** An emotion forced by an event (surprised, dizzy, worried…) and how long it lasts. */
  private heldEmotion: Emotion | null = null;
  private heldFor = 0;
  /** After a slip the spirit needs a moment before trying again. */
  private recoverLeft = 0;
  private wasSlip = false;
  /** Where the viewer's head is (island-local), set every frame by the game. */
  readonly viewer = v3(0, 0.4, 0.6);
  /** Something interesting to watch (e.g. the spirit being helped), or null. */
  watch: V3 | null = null;
  /** Set by the level when a leaf bridge is in place. */
  leafPlaced = false;
  /** Centre of the folk, used for touch detection. */
  readonly touchPoint = v3();
  private tmp = v3();
  private probe = v3();

  constructor(readonly plan: FolkPlan, parent: Object3D, private events: FolkEvents) {
    const m = folkMesh(plan.tint, plan.personality);
    this.root = m.root;
    this.root.scale.setScalar(FOLK_SCALE);
    this.body = m.body;
    this.arm = m.arm;
    this.lanternMat = m.lanternMat;
    this.glow = m.glow;
    this.eyeMat = m.eyeMat;
    this.eyes = m.eyes;
    this.dizzyStars = m.dizzy;
    this.traits = TRAITS[plan.personality];
    this.blinkIn = this.traits.blinkEvery;
    parent.add(this.root);
    this.delayLeft = plan.delay;
    this.reset();
  }

  reset() {
    this.state = 'sleep';
    this.emotion = 'sleepy';
    this.heldEmotion = null;
    this.seg = 0;
    this.s = 0;
    this.waitTime = 0;
    this.help = null;
    this.balance = 1;
    this.slips = 0;
    this.recoverLeft = 0;
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

  /** Index of the current route segment (for tests and hints). */
  get segmentIndex() {
    return this.seg;
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

  /** Custom help text for the current segment, if any. */
  get helpText(): [string, string] | undefined {
    const seg = this.segment;
    return seg && seg.kind !== 'walk' ? seg.help : undefined;
  }

  private set(state: FolkState) {
    this.state = state;
    this.stateTime = 0;
  }

  /* --------------------------------------------------------- reactions -- */

  /** Show an emotion for a while (events override the contextual default). */
  feel(e: Emotion, seconds: number) {
    this.heldEmotion = e;
    this.heldFor = seconds;
  }

  /** Celebrate (another spirit arrived, or the finale). */
  cheer(strength = 1) {
    this.glowPulse = Math.max(this.glowPulse, 0.8 * strength);
    this.feel('celebrating', 1.4);
    switch (this.traits.celebrate) {
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

  /** Another spirit just slipped: show concern. */
  worry() {
    if (this.isSeated) this.feel('nervous', 1.6);
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

  update(dt: number, hands: readonly HandSample[], obstacles: readonly Obstacle[] = []) {
    this.t += dt;
    this.stateTime += dt;
    this.recoverLeft = Math.max(0, this.recoverLeft - dt);
    if (this.heldEmotion) {
      this.heldFor -= dt;
      if (this.heldFor <= 0) this.heldEmotion = null;
    }
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
          this.feel('surprised', 0.7);
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
        this.checkObstacles(obstacles);
        break;
      case 'ride':
        this.updateRide(dt, hands);
        this.checkObstacles(obstacles);
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
    this.emotion = this.heldEmotion ?? this.contextEmotion(hands);
    this.apply(dt, hands);
  }

  private beginSegment() {
    const seg = this.segment;
    this.s = 0;
    this.waitTime = 0;
    this.balance = 1;
    if (!seg) {
      this.set('seated');
      copyV3(this.pos, this.plan.seat);
      this.help = null;
      this.bounce(3, 0.3);
      this.glowPulse = 1.2;
      this.feel('celebrating', 2.2);
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

  /** Lose footing: float back to the segment's safe start (its checkpoint). */
  private slip(reason: 'balance' | 'branch' | 'tracking') {
    const seg = this.segment;
    if (!seg) return;
    copyV3(this.returnTarget, seg.kind === 'bridge' ? seg.span.from : seg.kind === 'lift' ? seg.from : this.pos);
    copyV3(this.hopFrom, this.pos);
    this.slips++;
    this.lastSlip = reason;
    this.wasSlip = true;
    this.balance = 1;
    this.help = null;
    this.feel('surprised', 0.6);
    this.glowPulse = 0;
    this.events.slip(this, reason);
    this.set('return');
  }

  private updateBridgeOrLift(dt: number, hands: readonly HandSample[]) {
    const seg = this.segment;
    if (!seg) return;
    const ready = this.recoverLeft <= 0;
    if (seg.kind === 'lift') {
      this.help = ready ? 'lift' : null;
      copyV3(this.pos, seg.from);
      this.waitTime += dt;
      // A beat of hesitation (personality) makes boarding read as a decision.
      if (ready && this.stateTime > this.traits.hesitate && canBoard(seg.from, hands, this.sup)) {
        this.rideHand = this.sup.hand;
        copyV3(this.hopFrom, this.pos);
        // Hop onto the middle of the palm (whichever way it faces).
        palmSurface(hands[this.rideHand], this.hopTo);
        this.keepAboveGround(this.hopTo, seg.from);
        this.help = null;
        this.balance = 1;
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
    // Hesitate at the edge even once a hand appears (longer for shy spirits).
    const hesitating = this.state === 'wait' && (this.stateTime < this.traits.hesitate || !ready);
    if (!this.step.blocked && !hesitating) {
      if (this.state === 'wait') this.bounce(1, 0.28); // a little hop of courage
      if (this.state !== 'bridge') this.set('bridge');
      this.help = null;
      // Balance: only while actually standing on a hand.
      if (this.step.onHand && this.step.hand >= 0) {
        const h = hands[this.step.hand];
        this.balance = updateBalance(this.balance, h.tilt, h.speed, dt);
        if (this.balance <= 0) return this.slip('balance');
      } else {
        this.balance = Math.min(1, this.balance + dt);
      }
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
      this.help = !ready ? null : seg.leafSlot ? 'leaf' : 'bridge';
      this.waitTime += dt;
      lerpV3(this.pos, span.from, span.to, this.s / L);
      return;
    }
    // Mid-gap with the hand gone: spirits can hover briefly, then drift back.
    if (this.state !== 'hover') {
      this.set('hover');
      this.feel('scared', 2.6);
      this.events.worry(this);
    }
    this.pos.y = this.prev.y + Math.sin(this.t * 6) * 0.0004;
    // A hand that is there but not a usable path (e.g. on its side) counts as a balance slip.
    if (this.stateTime > 2.6) this.slip(hands.some((h) => h.present) ? 'balance' : 'tracking');
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
      if (this.wasSlip) {
        // Dizzy for a moment, then ready to try again (an automatic retry).
        this.wasSlip = false;
        this.feel('dizzy', 1.8);
        this.recoverLeft = 1.8;
      }
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
      // Tracking lost: hold position and look worried; float to safety after a moment.
      this.waitTime += dt;
      if (this.waitTime > 0.3) this.feel('scared', 0.5);
      if (this.waitTime > 1.2) {
        const toGoal = dist3(this.pos, seg.to) < dist3(this.pos, seg.from) && dist3(this.pos, seg.to) < 0.1;
        if (toGoal) {
          copyV3(this.returnTarget, seg.to);
          copyV3(this.hopFrom, this.pos);
          this.set('return');
        } else {
          this.slip('tracking');
        }
      }
      return;
    }
    this.waitTime = 0;
    this.help = null;
    this.balance = updateBalance(this.balance, hand.tilt, hand.speed, dt);
    if (this.balance <= 0) return this.slip('balance');
    palmSurface(hand, this.hopTo);
    this.keepAboveGround(this.hopTo, seg.from);
    const k = Math.min(1, dt * 22);
    lerpV3(this.pos, this.pos, this.hopTo, k);
    this.tickSteps(dt, false);
    if (canLand(this.pos, seg.to, seg.landRadius)) {
      copyV3(this.hopFrom, this.pos);
      copyV3(this.hopTo, seg.to);
      this.events.hop(this);
      this.feel('happy', 0.8);
      this.set('hop-off');
    }
  }

  private checkObstacles(obstacles: readonly Obstacle[]) {
    // A moment of grace right after climbing aboard.
    if (this.state !== 'ride' || this.stateTime < 0.6) return;
    this.probe.x = this.pos.x;
    this.probe.y = this.pos.y + 0.02;
    this.probe.z = this.pos.z;
    for (const o of obstacles) {
      if (distToSegment(this.probe, o.a, o.b) < o.radius + BODY_RADIUS) {
        this.slip('branch');
        return;
      }
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

  /** The emotion that fits the current situation (when no event overrides it). */
  private contextEmotion(hands: readonly HandSample[]): Emotion {
    const tr = this.traits;
    switch (this.state) {
      case 'sleep':
        return 'sleepy';
      case 'waking':
        return 'curious';
      case 'walk':
        return this.segment === this.plan.route[0] ? 'curious' : 'happy';
      case 'wait':
        return this.recoverLeft > 0 ? 'dizzy' : tr.waiting;
      case 'bridge':
      case 'ride':
      case 'hop-on':
        if (this.balance < 0.45) return 'scared';
        if (this.balance < 0.8) return 'nervous';
        return this.state === 'bridge' && !this.step.onHand ? 'determined' : tr.carried;
      case 'hover':
        return 'scared';
      case 'return':
        return 'surprised';
      case 'hop-off':
        return 'happy';
      case 'seated': {
        const near = this.nearestHand(hands, this.tmp) < 0.25;
        return near ? 'grateful' : 'happy';
      }
      case 'gather':
        return 'celebrating';
      case 'thank':
        return 'grateful';
    }
  }

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

  private chooseLook(hands: readonly HandSample[]): number | null {
    const handDist = this.nearestHand(hands, this.tmp);
    const sees = handDist < NOTICE_RADIUS * this.traits.curiosity;
    switch (this.state) {
      case 'sleep':
        // Half asleep, it still turns toward a hand that comes close.
        return handDist < 0.28 ? this.yawTo(this.tmp) : null;
      case 'walk':
        return sees ? this.yawTo(this.tmp) : null;
      case 'wait': {
        if (this.emotion === 'dizzy') return null;
        // Hesitate: look across the gap, then back at the hand / the player.
        const seg = this.segment;
        const phase = Math.floor(this.stateTime / 1.3) % 2;
        if (phase === 0 && seg && seg.kind === 'bridge') return this.yawTo(seg.span.to);
        if (phase === 0 && seg && seg.kind === 'lift') return this.yawTo(seg.to);
        return sees ? this.yawTo(this.tmp) : this.yawTo(this.viewer);
      }
      case 'ride':
      case 'hop-on':
        return this.balance < 0.8 ? this.yawTo(this.tmp) : this.yawTo(this.viewer);
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
        return null;
    }
  }

  /** Push simulated state and emotion to the meshes. */
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
    if (moving && this.state !== 'ride' && this.state !== 'hover' && this.state !== 'hop-on' && this.state !== 'return') {
      this.turnRoot(Math.atan2(dx, dz), dt * 10);
    }

    const e = this.emotion;
    const tr = this.traits;
    // Attention.
    const want = this.chooseLook(hands);
    this.glanceIn -= dt;
    if (this.glanceIn <= 0) {
      this.glanceIn = (e === 'nervous' ? 0.8 : 1.8) + Math.random() * 2.5;
      this.glanceYaw = (Math.random() - 0.5) * (e === 'nervous' ? 1.6 : 1.1);
    }
    let targetOffset = 0;
    if (want !== null) {
      if (this.isSeated || this.state === 'wait') this.turnRoot(want, dt * 3);
      targetOffset = wrap(want - this.faceYaw);
    } else if (this.state !== 'sleep') {
      targetOffset = this.glanceYaw * 0.5;
    }
    targetOffset = Math.max(-1.2, Math.min(1.2, targetOffset));
    this.lookYaw += (targetOffset - this.lookYaw) * Math.min(1, dt * 5);
    r.rotation.y = this.faceYaw;

    const b = this.body;
    const walking = this.state === 'walk' || this.state === 'bridge' || this.state === 'gather' || this.state === 'thank';
    const sleeping = this.state === 'sleep';
    const handDist = this.nearestHand(hands, this.tmp);
    // Lean: curious and determined spirits lean in; bowing when thanking.
    let leanTarget = 0;
    if (sleeping) leanTarget = 0.35;
    else if (e === 'curious') leanTarget = handDist < 0.12 ? -0.2 : -0.1;
    else if (e === 'determined') leanTarget = -0.16;
    else if (e === 'scared') leanTarget = 0.12;
    if (this.state === 'thank' && this.stateTime > 2.4) leanTarget = 0.45 * Math.max(0, Math.sin((this.stateTime - 2.4) * 2.2));
    this.lean += (leanTarget - this.lean) * Math.min(1, dt * 6);
    // Carried: sway against the hand's motion, plus a wobble when balance is low.
    let tiltX = 0;
    let tiltZ = 0;
    if (this.state === 'ride') {
      tiltX = Math.max(-0.35, Math.min(0.35, this.velZ * 3));
      tiltZ = Math.max(-0.35, Math.min(0.35, -this.velX * 3));
    }
    const wobble = this.isCarried ? (1 - this.balance) * 0.5 : 0;
    tiltZ += Math.sin(this.t * 11) * wobble;
    tiltX += Math.cos(this.t * 9) * wobble * 0.6;
    if (e === 'dizzy') {
      tiltZ += Math.sin(this.t * 6) * 0.22;
      tiltX += Math.cos(this.t * 6) * 0.22;
    }
    if (e === 'curious') tiltZ += 0.22 * Math.sin(this.t * 0.9 + tr.blinkEvery); // head tilt

    // Emotion-driven hops.
    if (this.bounceLeft <= 0) {
      if (e === 'excited' && Math.random() < dt * 0.9) this.bounce(1, 0.22);
      if (e === 'celebrating' && Math.random() < dt * 1.4) this.bounce(1, 0.3);
      if (e === 'happy' && Math.random() < dt * 0.25) this.bounce(1, 0.3);
    }
    let hop = 0;
    if (this.bounceLeft > 0) {
      this.bounceLeft -= dt;
      const ph = (this.bounceLeft % this.bounceDur) / this.bounceDur;
      hop = Math.sin(ph * Math.PI) * (e === 'surprised' ? 0.016 : 0.012);
    }
    let spin = 0;
    if (this.spinLeft > 0) {
      this.spinLeft -= dt;
      spin = (1 - this.spinLeft / 0.7) * Math.PI * 2;
    } else if (e === 'celebrating' && tr.celebrate === 'spin' && Math.random() < dt * 0.4) {
      this.spinLeft = 0.7;
    }
    // Trembling when nervous or scared (personality scales it).
    const trembleAmt = (e === 'scared' ? 0.0011 : e === 'nervous' ? 0.0005 : 0) * tr.tremble;
    const tremble = trembleAmt ? Math.sin(this.t * 47) * trembleAmt : 0;

    this.squash += (0 - this.squash) * Math.min(1, dt * 8);
    const bob = walking ? Math.abs(Math.sin(this.t * 14)) * 0.0025 : 0;
    const breathe = Math.sin(this.t * (sleeping ? 1.6 : tr.breathe)) * (sleeping ? 0.05 : 0.025);
    const riding = this.state === 'ride' ? Math.sin(this.t * 4) * 0.0015 : 0;
    b.position.set(tremble, bob + hop + riding + (this.state === 'hover' ? 0.004 + Math.sin(this.t * 5) * 0.002 : 0), 0);
    b.rotation.set(
      this.lean + tiltX,
      this.lookYaw + spin,
      (walking ? Math.sin(this.t * 7) * 0.08 : 0) + tiltZ + (tr.celebrate === 'sway' && hop > 0 ? Math.sin(this.t * 12) * 0.2 : 0),
    );
    const shrink = e === 'scared' ? 0.9 : 1;
    const sy = (1 + breathe - this.squash) * shrink;
    b.scale.set((1 + this.squash * 0.5) * shrink, sleeping ? sy * 0.88 : sy, (1 + this.squash * 0.5) * shrink);

    // Arm: lantern raised when excited/celebrating, waved when grateful, clutched when scared.
    let armZ = 0;
    if (e === 'grateful') armZ = 0.5 + Math.sin(this.t * 7) * 0.45;
    else if (e === 'celebrating' || e === 'excited') armZ = 0.6 + Math.sin(this.t * 9) * 0.25;
    else if (e === 'scared' || e === 'nervous') armZ = -0.35;
    else if (e === 'determined') armZ = 0.35;
    this.arm.rotation.z += (armZ - this.arm.rotation.z) * Math.min(1, dt * 8);

    // Eyes: blink; wide when surprised or scared; closed when sleepy.
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkT = e === 'surprised' || e === 'dizzy' ? 0.08 : 0.13;
      this.blinkIn = tr.blinkEvery * (e === 'dizzy' ? 0.3 : 0.6 + Math.random() * 0.8);
    }
    this.blinkT = Math.max(0, this.blinkT - dt);
    const eyeOpen = sleeping ? 0.15 : this.blinkT > 0 ? 0.15 : e === 'surprised' || e === 'scared' ? 1.5 : e === 'happy' || e === 'grateful' ? 0.7 : 1;
    for (const eye of this.eyes) {
      eye.scale.y = 1.3 * eyeOpen;
      eye.scale.x = e === 'surprised' || e === 'scared' ? 1.3 : 1;
    }

    // Dizzy stars.
    this.dizzyStars.visible = e === 'dizzy';
    if (this.dizzyStars.visible) this.dizzyStars.rotation.y += dt * 4;

    // Lantern: dim asleep, bright awake, pulsing when it needs help, flaring on joy, dim when scared.
    this.glowPulse = Math.max(0, this.glowPulse - dt * 0.9);
    const need = this.help ? 0.5 + 0.5 * Math.sin(this.t * 5) : 0;
    const flicker = 0.04 * Math.sin(this.t * 7.3 + tr.blinkEvery) * Math.sin(this.t * 3.1);
    const stir = sleeping && handDist < 0.12 ? 0.25 : 0;
    const fear = e === 'scared' ? -0.35 : e === 'dizzy' ? -0.25 : 0;
    const joy = e === 'celebrating' || e === 'excited' ? 0.2 : 0;
    const bright = sleeping
      ? 0.25 + 0.08 * Math.sin(this.t * 1.6) + stir
      : Math.max(0.3, 0.85 + need * 0.35 + flicker + this.glowPulse * 0.6 + fear + joy);
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
