/**
 * A single lantern spirit: walks its route, waits for the player's help,
 * crosses hands, rides palms and finally settles by the great tree.
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
  invertRigid,
  isPoking,
  lerpV3,
  samplePolyline,
  smoothstep,
  spanLength,
  stepBridge,
  SupportResult,
  transformPoint,
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
  | 'seated';

export type HelpKind = 'bridge' | 'lift' | 'leaf' | null;

export interface FolkEvents {
  wake(f: Folk): void;
  step(f: Folk): void;
  hop(f: Folk): void;
  arrive(f: Folk): void;
  worry(f: Folk): void;
}

const WALK_SPEED = 0.042;
const BRIDGE_SPEED = 0.036;

export class Folk {
  readonly root: Group;
  private body: Group;
  private lanternMat: MeshBasicMaterial;
  private glow: Sprite;
  private eyeMat: MeshBasicMaterial;
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
  private rideOffset = v3();
  private inv = new Float32Array(16);
  private sup: SupportResult = { y: 0, hand: -1 };
  private step: BridgeStep = { s: 0, y: 0, blocked: false, onHand: false };
  private stepClock = 0;
  private returnTarget = v3();
  private returnFromS = 0;
  private faceYaw = 0;
  private squash = 0;
  /** Set by the level when a leaf bridge is in place. */
  leafPlaced = false;

  constructor(readonly plan: FolkPlan, parent: Object3D, private events: FolkEvents) {
    const m = folkMesh(plan.tint);
    this.root = m.root;
    this.body = m.body;
    this.lanternMat = m.lanternMat;
    this.glow = m.glow;
    this.eyeMat = m.eyeMat;
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
    this.delayLeft = this.plan.delay;
    copyV3(this.pos, this.plan.start);
    copyV3(this.prev, this.plan.start);
    const first = this.plan.route[0];
    if (first.kind === 'walk' && first.line.points.length > 1) {
      const p1 = first.line.points[1];
      this.faceYaw = Math.atan2(p1.x - this.pos.x, p1.z - this.pos.z);
    }
    this.apply(0);
  }

  get position(): V3 {
    return this.pos;
  }

  /** Centre of the folk, used for touch detection. */
  readonly touchPoint = v3();

  get segment(): Segment | undefined {
    return this.plan.route[this.seg];
  }

  get isAwake() {
    return this.state !== 'sleep';
  }

  get isSeated() {
    return this.state === 'seated';
  }

  private set(state: FolkState) {
    this.state = state;
    this.stateTime = 0;
  }

  update(dt: number, hands: readonly HandSample[]) {
    this.t += dt;
    this.stateTime += dt;
    copyV3(this.prev, this.pos);
    this.touchPoint.x = this.pos.x;
    this.touchPoint.y = this.pos.y + 0.022;
    this.touchPoint.z = this.pos.z;

    switch (this.state) {
      case 'sleep':
        if (isPoking(hands, this.touchPoint)) {
          this.set('waking');
          this.events.wake(this);
        }
        break;
      case 'waking':
        if (this.stateTime > 0.9) {
          if (this.delayLeft > 0) {
            this.delayLeft -= dt;
          } else {
            this.beginSegment();
          }
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
        this.updateReturn(dt);
        break;
      case 'hop-on':
        this.updateHop(dt, () => {
          this.set('ride');
        });
        break;
      case 'ride':
        this.updateRide(dt, hands);
        break;
      case 'hop-off':
        this.updateHop(dt, () => this.nextSegment());
        break;
      case 'seated':
        break;
    }
    this.apply(dt);
  }

  private beginSegment() {
    const seg = this.segment;
    this.s = 0;
    this.waitTime = 0;
    if (!seg) {
      copyV3(this.hopFrom, this.pos);
      copyV3(this.hopTo, this.plan.seat);
      this.set('seated');
      copyV3(this.pos, this.plan.seat);
      this.help = null;
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
      if (canBoard(seg.from, hands, this.sup)) {
        this.rideHand = this.sup.hand;
        copyV3(this.hopFrom, this.pos);
        this.hopTo.x = seg.from.x;
        this.hopTo.y = this.sup.y;
        this.hopTo.z = seg.from.z;
        // Remember where we stand relative to the wrist so we ride along.
        invertRigid(hands[this.rideHand].wrist, this.inv);
        transformPoint(this.inv, this.hopTo, this.rideOffset);
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
      // Solid leaf: just walk across, slightly raised.
      this.help = null;
      this.s = Math.min(L, this.s + BRIDGE_SPEED * dt);
      lerpV3(this.pos, span.from, span.to, this.s / L);
      const mid = Math.sin((this.s / L) * Math.PI);
      this.pos.y += mid * 0.006;
      this.set('bridge');
      this.tickSteps(dt, false);
      if (this.s >= L - 1e-4) this.nextSegment();
      return;
    }
    stepBridge(span, this.s, BRIDGE_SPEED, dt, hands, this.step);
    if (!this.step.blocked) {
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
    // Blocked.
    const onGround = this.s <= span.groundLength + 1e-4;
    if (onGround) {
      if (this.state !== 'wait') this.set('wait');
      this.help = seg.leafSlot ? 'leaf' : 'bridge';
      this.waitTime += dt;
      lerpV3(this.pos, span.from, span.to, this.s / L);
      return;
    }
    // Mid-air: spirits can hover briefly, then drift back to safety.
    if (this.state !== 'hover') {
      this.set('hover');
      this.events.worry(this);
    }
    this.pos.y = this.prev.y + Math.sin(this.t * 6) * 0.0004;
    if (this.stateTime > 2.6) {
      copyV3(this.returnTarget, span.from);
      this.returnFromS = this.s;
      copyV3(this.hopFrom, this.pos);
      this.set('return');
    }
  }

  private updateReturn(dt: number) {
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

  private updateHop(dt: number, done: () => void) {
    const T = 0.38;
    const u = Math.min(1, this.stateTime / T);
    lerpV3(this.pos, this.hopFrom, this.hopTo, u);
    this.pos.y += Math.sin(u * Math.PI) * 0.022;
    this.squash = Math.sin(u * Math.PI) * -0.15;
    if (u >= 1) {
      this.squash = 0.18;
      done();
    }
    void dt;
  }

  private updateRide(dt: number, hands: readonly HandSample[]) {
    const seg = this.segment;
    if (!seg || seg.kind !== 'lift') return;
    const hand = hands[this.rideHand];
    if (!hand || !hand.present) {
      // Tracking lost: hover, then float to whichever pad is closer.
      this.waitTime += dt;
      if (this.waitTime > 0.9) {
        const toGoal = dist3(this.pos, seg.to) < dist3(this.pos, seg.from) && dist3(this.pos, seg.to) < 0.1;
        copyV3(this.returnTarget, toGoal ? seg.to : seg.from);
        copyV3(this.hopFrom, this.pos);
        this.set('return');
      }
      return;
    }
    this.waitTime = 0;
    transformPoint(hand.wrist, this.rideOffset, this.hopTo);
    const k = Math.min(1, dt * 22);
    lerpV3(this.pos, this.pos, this.hopTo, k);
    this.tickSteps(dt, distXZ(this.pos, this.prev) > 0.0004);
    if (canLand(this.pos, seg.to)) {
      copyV3(this.hopFrom, this.pos);
      copyV3(this.hopTo, seg.to);
      this.events.hop(this);
      this.set('hop-off');
      // hop-off completes into the next segment.
    }
  }

  private tickSteps(dt: number, audible: boolean) {
    this.stepClock += dt;
    if (this.stepClock > 0.26) {
      this.stepClock = 0;
      if (audible) this.events.step(this);
    }
  }

  /** Push simulated state to the meshes. */
  private apply(dt: number) {
    const r = this.root;
    r.position.set(this.pos.x, this.pos.y, this.pos.z);
    const dx = this.pos.x - this.prev.x;
    const dz = this.pos.z - this.prev.z;
    if (dx * dx + dz * dz > 1e-9 && this.state !== 'ride' && this.state !== 'hover') {
      const target = Math.atan2(dx, dz);
      let d = target - this.faceYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.faceYaw += d * Math.min(1, dt * 10);
    }
    if (this.state === 'seated') {
      // Face outward from the tree, toward the player side of its zone.
      const target = Math.atan2(this.plan.seat.x, this.plan.seat.z);
      let d = target - this.faceYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.faceYaw += d * Math.min(1, dt * 4);
    }
    r.rotation.y = this.faceYaw;
    this.squash += (0 - this.squash) * Math.min(1, dt * 8);
    const b = this.body;
    const moving = this.state === 'walk' || this.state === 'bridge';
    const sleeping = this.state === 'sleep';
    const bob = moving ? Math.abs(Math.sin(this.t * 14)) * 0.0025 : 0;
    const breathe = Math.sin(this.t * (sleeping ? 1.6 : 2.4)) * (sleeping ? 0.05 : 0.025);
    b.position.y = bob + (this.state === 'hover' ? 0.004 + Math.sin(this.t * 5) * 0.002 : 0);
    b.rotation.z = moving ? Math.sin(this.t * 7) * 0.08 : 0;
    b.rotation.x = sleeping ? 0.35 : this.state === 'wait' ? -0.08 : 0;
    const sy = 1 + breathe - this.squash;
    b.scale.set(1 + this.squash * 0.5, sleeping ? sy * 0.88 : sy, 1 + this.squash * 0.5);
    // Lantern brightness tells the story: dim asleep, bright awake, pulsing when it needs help.
    const need = this.help ? 0.5 + 0.5 * Math.sin(this.t * 5) : 0;
    const bright = sleeping ? 0.25 + 0.08 * Math.sin(this.t * 1.6) : 0.85 + need * 0.35;
    (this.glow.material as SpriteMaterial).opacity = bright;
    const s = 0.05 + bright * 0.035 + (this.state === 'seated' ? 0.02 : 0);
    this.glow.scale.set(s, s, s);
    this.lanternMat.color.setHex(this.plan.tint).multiplyScalar(sleeping ? 0.45 : 1);
    this.eyeMat.color.setHex(sleeping ? 0x2a2645 : 0xfff6d8);
  }
}
