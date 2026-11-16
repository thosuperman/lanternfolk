/**
 * Soft moonlit hand rendering: one instanced mesh of joint "pearls" and one of
 * bone capsules per hand (2 draw calls per hand). Driven by the same island-local
 * joint data the gameplay uses, so what the player sees is what the folk feel.
 */
import {
  AdditiveBlending,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import type { HandSample } from './logic.js';

// WebXR joint order: wrist, thumb(4), index(5), middle(5), ring(5), pinky(5)
const BONES: [number, number][] = [];
for (const [start, len] of [
  [1, 4],
  [5, 5],
  [10, 5],
  [15, 5],
  [20, 5],
] as const) {
  BONES.push([0, start]);
  for (let i = start; i < start + len - 1; i++) BONES.push([i, i + 1]);
}
// knuckle line to give the palm some body
BONES.push([6, 11], [11, 16], [16, 21], [2, 6], [1, 21], [1, 16], [2, 21], [7, 22], [12, 22]);

export class HandVisual {
  readonly group = new Group();
  private pearls: InstancedMesh[] = [];
  private bones: InstancedMesh[] = [];
  private m = new Matrix4();
  private q = new Quaternion();
  private a = new Vector3();
  private b = new Vector3();
  private d = new Vector3();
  private s = new Vector3();
  private up = new Vector3(0, 1, 0);
  private alpha = [0, 0];

  constructor() {
    const pearlGeo = new SphereGeometry(1, 8, 6);
    const boneGeo = new CylinderGeometry(1, 1, 1, 6, 1, true);
    for (let h = 0; h < 2; h++) {
      const pm = new MeshBasicMaterial({
        color: 0xffe2a6,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      const bm = new MeshBasicMaterial({
        color: 0x7f93ff,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: AdditiveBlending,
      });
      const pearls = new InstancedMesh(pearlGeo, pm, 25);
      const bones = new InstancedMesh(boneGeo, bm, BONES.length);
      pearls.frustumCulled = false;
      bones.frustumCulled = false;
      pearls.renderOrder = 12;
      bones.renderOrder = 11;
      this.pearls.push(pearls);
      this.bones.push(bones);
      this.group.add(bones, pearls);
    }
  }

  update(hands: readonly HandSample[], dt: number, highlight: boolean[]) {
    for (let h = 0; h < 2; h++) {
      const hand = hands[h];
      const target = hand.present ? 1 : 0;
      this.alpha[h] += (target - this.alpha[h]) * Math.min(1, dt * 8);
      const pearls = this.pearls[h];
      const bones = this.bones[h];
      const vis = this.alpha[h] > 0.02;
      pearls.visible = bones.visible = vis;
      if (!vis || !hand.present) continue;
      const j = hand.joints;
      const glow = highlight[h] ? 1.6 : 1;
      (pearls.material as MeshBasicMaterial).opacity = 0.5 * this.alpha[h] * glow;
      (bones.material as MeshBasicMaterial).opacity = 0.42 * this.alpha[h] * glow;
      for (let i = 0; i < 25; i++) {
        const r = Math.max(0.0028, Math.min(0.0065, hand.radii[i] * 0.45));
        this.a.set(j[i * 3], j[i * 3 + 1], j[i * 3 + 2]);
        this.s.set(r, r, r);
        this.m.compose(this.a, this.q.identity(), this.s);
        pearls.setMatrixAt(i, this.m);
      }
      pearls.instanceMatrix.needsUpdate = true;
      for (let k = 0; k < BONES.length; k++) {
        const [i0, i1] = BONES[k];
        this.a.set(j[i0 * 3], j[i0 * 3 + 1], j[i0 * 3 + 2]);
        this.b.set(j[i1 * 3], j[i1 * 3 + 1], j[i1 * 3 + 2]);
        this.d.subVectors(this.b, this.a);
        const len = this.d.length();
        if (len < 1e-5) {
          this.s.set(0, 0, 0);
          this.m.compose(this.a, this.q.identity(), this.s);
        } else {
          this.d.divideScalar(len);
          this.q.setFromUnitVectors(this.up, this.d);
          const r = Math.max(0.0045, Math.min(0.011, Math.min(hand.radii[i0], hand.radii[i1]) * 0.85));
          this.s.set(r, len, r);
          this.a.addScaledVector(this.d, len / 2);
          this.m.compose(this.a, this.q, this.s);
        }
        bones.setMatrixAt(k, this.m);
      }
      bones.instanceMatrix.needsUpdate = true;
    }
  }
}
