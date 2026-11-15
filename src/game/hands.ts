/**
 * Reads WebXR hand-tracking joints every frame (XRFrame.getJointPose — the
 * same API on Quest Browser and in the IWER emulator) and converts them into
 * the island's local space for the pure rules in logic.ts.
 */
import { Matrix4, Object3D, Vector3 } from '@iwsdk/core';
import type { World } from '@iwsdk/core';
import {
  createHandSample,
  dist3,
  HandSample,
  JOINT_COUNT,
  updatePinch,
} from './logic.js';

const INDEX_TIP = 9;
const THUMB_TIP = 4;

export class HandTracker {
  /** [left, right] */
  readonly hands: HandSample[] = [createHandSample(), createHandSample()];
  /** World-space copies, for visuals that are not parented to the island. */
  readonly worldIndexTip = [new Vector3(), new Vector3()];
  /** True when at least one hand has been seen during this session. */
  everTracked = false;
  /** Seconds since any hand was last tracked. */
  lostFor = 0;

  private poses = new Float32Array(JOINT_COUNT * 16);
  private radii = new Float32Array(JOINT_COUNT);
  private jointSpaces: XRJointSpace[] = [];
  private toLocal = new Matrix4();
  private invIsland = new Matrix4();
  private tmpM = new Matrix4();
  private tmpV = new Vector3();

  constructor(private world: World) {}

  update(island: Object3D, dt: number) {
    const frame = this.world.xrFrame;
    const ref = this.world.xrReferenceSpace;
    const session = this.world.xrSession;
    this.hands[0].present = false;
    this.hands[1].present = false;
    if (!frame || !ref || !session) {
      this.lostFor += dt;
      return;
    }
    island.updateWorldMatrix(true, false);
    this.world.player.updateWorldMatrix(true, false);
    this.invIsland.copy(island.matrixWorld).invert();
    this.toLocal.multiplyMatrices(this.invIsland, this.world.player.matrixWorld);
    const e = this.toLocal.elements;

    let any = false;
    for (const source of session.inputSources) {
      const hand = source.hand;
      if (!hand || (source.handedness !== 'left' && source.handedness !== 'right')) continue;
      const idx = source.handedness === 'left' ? 0 : 1;
      const sample = this.hands[idx];
      this.jointSpaces.length = 0;
      hand.forEach((space) => this.jointSpaces.push(space));
      if (this.jointSpaces.length < JOINT_COUNT) continue;
      let ok = false;
      const f = frame as XRFrame & {
        fillPoses?: (s: XRSpace[], b: XRSpace, out: Float32Array) => boolean;
        fillJointRadii?: (s: XRJointSpace[], out: Float32Array) => boolean;
      };
      if (typeof f.fillPoses === 'function') {
        ok = f.fillPoses(this.jointSpaces, ref, this.poses);
        if (ok && typeof f.fillJointRadii === 'function') {
          f.fillJointRadii(this.jointSpaces, this.radii);
        }
      } else {
        ok = true;
        for (let i = 0; i < JOINT_COUNT; i++) {
          const p = frame.getJointPose?.(this.jointSpaces[i], ref);
          if (!p) {
            ok = false;
            break;
          }
          this.poses.set(p.transform.matrix, i * 16);
          this.radii[i] = p.radius ?? 0.01;
        }
      }
      if (!ok) continue;
      any = true;
      sample.present = true;
      for (let i = 0; i < JOINT_COUNT; i++) {
        const o = i * 16;
        const x = this.poses[o + 12];
        const y = this.poses[o + 13];
        const z = this.poses[o + 14];
        sample.joints[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
        sample.joints[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        sample.joints[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        sample.radii[i] = Math.min(0.02, Math.max(0.004, this.radii[i] || 0.01));
      }
      this.tmpM.fromArray(this.poses, 0);
      this.tmpM.premultiply(this.toLocal);
      sample.wrist.set(this.tmpM.elements);
      const j = sample.joints;
      sample.indexTip.x = j[INDEX_TIP * 3];
      sample.indexTip.y = j[INDEX_TIP * 3 + 1];
      sample.indexTip.z = j[INDEX_TIP * 3 + 2];
      sample.thumbTip.x = j[THUMB_TIP * 3];
      sample.thumbTip.y = j[THUMB_TIP * 3 + 1];
      sample.thumbTip.z = j[THUMB_TIP * 3 + 2];
      sample.pinchPoint.x = (sample.indexTip.x + sample.thumbTip.x) / 2;
      sample.pinchPoint.y = (sample.indexTip.y + sample.thumbTip.y) / 2;
      sample.pinchPoint.z = (sample.indexTip.z + sample.thumbTip.z) / 2;
      const pressed = !!source.gamepad?.buttons?.[0]?.pressed;
      sample.pinching = updatePinch(
        sample.pinching,
        dist3(sample.indexTip, sample.thumbTip),
        pressed,
      );
      this.tmpV.set(sample.indexTip.x, sample.indexTip.y, sample.indexTip.z);
      this.worldIndexTip[idx].copy(island.localToWorld(this.tmpV));
    }
    for (const s of this.hands) if (!s.present) s.pinching = false;
    if (any) {
      this.everTracked = true;
      this.lostFor = 0;
    } else {
      this.lostFor += dt;
    }
  }

  anyPresent() {
    return this.hands[0].present || this.hands[1].present;
  }
}
