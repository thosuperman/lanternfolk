/**
 * LanternfolkSystem: owns the diorama, level flow, hints and the finale.
 */
import {
  Color,
  createSystem,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PointLight,
  SpriteMaterial,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { sound } from './audio.js';
import { Folk, FolkEvents } from './folk.js';
import { HandTracker } from './hands.js';
import { HandVisual } from './handVisual.js';
import { CENTRAL_RADIUS, LevelPlan, LEVELS, SOCKET, STAR_START } from './levels.js';
import {
  canSnap,
  copyV3,
  dist3,
  grabbingHand,
  isPoking,
  lerpV3,
  smoothstep,
  supportAt,
  V3,
  v3,
} from './logic.js';
import {
  flatMaterial,
  FlowerField,
  glowSprite,
  GeoBatch,
  greatTree,
  handHintMesh,
  islet,
  Label,
  leafMesh,
  Motes,
  mushrooms,
  pathLantern,
  ringHint,
  rng,
  sky,
  starMesh,
} from './scenery.js';

type Phase =
  | 'boot'
  | 'intro'
  | 'play'
  | 'celebrate'
  | 'transition'
  | 'star'
  | 'finale'
  | 'ending';

const DORMANT = new Color(0.34, 0.38, 0.62);
const ALIVE = new Color(0.86, 0.9, 0.95);

interface Zone {
  plan: LevelPlan;
  mat: MeshLambertMaterial;
  bloom: number;
  bloomTarget: number;
  flowers: FlowerField;
  lanterns: ReturnType<typeof pathLantern>[];
  folk: Folk[];
}

export interface GameDebug {
  phase: Phase;
  level: number;
  musicMuted: boolean;
  rescued: number;
  folk: { state: string; help: string | null; x: number; y: number; z: number }[];
  targets: Record<string, [number, number, number]>;
  skipTo(level: number): void;
  restart(): void;
  recenter(): void;
  reveal(): void;
  simulateTrackingLoss(seconds: number): void;
  probe(level: number): unknown;
}

export class LanternfolkSystem extends createSystem({}) {
  private island!: Group;
  private placed = false;
  private hands!: HandTracker;
  private handVisual!: HandVisual;
  private highlight = [false, false];
  private phase: Phase = 'boot';
  private phaseTime = 0;
  private level = 0;
  private zones: Zone[] = [];
  private label!: Label;
  private handHint!: Mesh;
  private ring!: Mesh;
  private motes!: Motes;
  private tree!: ReturnType<typeof greatTree>;
  private treeLight!: PointLight;
  private treeLanterns: import('@iwsdk/core').Sprite[] = [];
  private hemi!: HemisphereLight;
  private yaw = 0;
  private yawFrom = 0;
  private yawTo = 0;
  private leaf!: ReturnType<typeof leafMesh>;
  private leafPos = v3();
  private leafHome = v3();
  private leafHeld = -1;
  private leafPlaced = false;
  private leafReturn = 0;
  private star!: ReturnType<typeof starMesh>;
  private starPos = v3();
  private starHeld = -1;
  private starPlaced = false;
  private starReturn = 0;
  private replay!: ReturnType<typeof pathLantern>;
  private replayPos = v3(0, 0.07, 0.2);
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private dropFrom = v3();
  private paused = false;
  private skyStars!: ReturnType<typeof sky>;
  private hintCooldown = 0;
  private noHandsShown = false;
  private wasInXR = false;

  init() {
    this.hands = new HandTracker(this.world);
    this.buildWorld();
    this.cleanupFuncs.push(
      this.visibilityState.subscribe((v) => {
        this.paused = v === VisibilityState.Hidden || v === VisibilityState.VisibleBlurred;
        sound.setPaused(this.paused);
      }),
    );
    // Test/capture hooks for the emulator tooling (tools/*.py); not shipped in production builds.
    if (import.meta.env.DEV) this.exposeDebug();
    this.startGame();
  }

  /* --------------------------------------------------------------- build */

  private buildWorld() {
    const root = new Group();
    root.name = 'Grove';
    this.island = new Group();
    this.island.name = 'Island';
    root.add(this.island);
    this.world.createTransformEntity(root);

    // Light: cool moonlight + sky/ground fill. No shadows (standalone budget).
    this.hemi = new HemisphereLight(0x9fb2ff, 0x2a1d3d, 1.35);
    root.add(this.hemi);
    const moon = new DirectionalLight(0xc8d4ff, 1.4);
    moon.position.set(-1, 2, -0.5);
    root.add(moon);

    this.skyStars = sky();
    root.add(this.skyStars.group);

    // Central island + great tree.
    const centre = new GeoBatch();
    islet(centre, { radius: CENTRAL_RADIUS, depth: 0.2, seed: 3, decor: true }, [0, 0, 0]);
    const centreMesh = new Mesh(centre.build(), flatMaterial());
    this.island.add(centreMesh);
    const shroomSpots: [number, number, number][] = [];
    const r = rng(17);
    for (let i = 0; i < 7; i++) {
      const a = r() * Math.PI * 2;
      const d = 0.075 + r() * 0.045;
      shroomSpots.push([Math.cos(a) * d, 0, Math.sin(a) * d]);
    }
    this.island.add(mushrooms(shroomSpots, 4));
    this.tree = greatTree();
    this.island.add(this.tree.group);
    const palette = [0xffc861, 0x8fe3ff, 0xff9ec7, 0xc6a2ff, 0xffe9a8];
    this.tree.branchTips.forEach(([x, y, z], i) => {
      const g = glowSprite(palette[i % palette.length], 0.06, 0);
      g.position.set(x * 1.15, y - 0.012, z * 1.15);
      this.treeLanterns.push(g);
      this.tree.group.add(g);
    });
    this.treeLight = new PointLight(0xffc77a, 0, 0.9, 1.5);
    this.treeLight.position.set(0, 0.22, 0);
    this.island.add(this.treeLight);

    for (const plan of LEVELS) {
      const b = new GeoBatch();
      const c = plan.islet.center;
      islet(b, { radius: plan.islet.radius, depth: plan.islet.depth, seed: plan.islet.seed }, [c.x, c.y, c.z]);
      const mat = flatMaterial();
      mat.color.copy(DORMANT);
      this.island.add(new Mesh(b.build(), mat));
      const fr = rng(plan.islet.seed + 1);
      const spots: [number, number, number][] = [];
      for (let i = 0; i < 12; i++) {
        const a = fr() * Math.PI * 2;
        const d = plan.islet.radius * (0.35 + fr() * 0.55);
        spots.push([c.x + Math.cos(a) * d, c.y, c.z + Math.sin(a) * d]);
      }
      const flowers = new FlowerField(spots, plan.islet.seed);
      this.island.add(flowers.group);
      const lanterns = plan.lanterns.map((p) => {
        const l = pathLantern();
        l.group.position.set(p.x, p.y, p.z);
        this.island.add(l.group);
        return l;
      });
      const zone: Zone = { plan, mat, bloom: 0, bloomTarget: 0, flowers, lanterns, folk: [] };
      const events = this.folkEvents(zone);
      zone.folk = plan.folk.map((fp) => new Folk(fp, this.island, events));
      this.zones.push(zone);
    }
    // Centre island is also dormant until the end.
    (centreMesh.material as MeshLambertMaterial).color.copy(DORMANT).lerp(ALIVE, 0.35);
    this.zones.forEach((z) => (z.mat.userData.centre = centreMesh.material));

    this.leaf = leafMesh();
    this.island.add(this.leaf.group);
    this.star = starMesh();
    this.island.add(this.star.group);

    this.replay = pathLantern();
    this.replay.group.scale.setScalar(2.2);
    this.island.add(this.replay.group);

    this.bell = pathLantern();
    this.bell.group.scale.setScalar(1.4);
    this.island.add(this.bell.group);
    this.bellLabel = new Label(0.14, 4);
    this.island.add(this.bellLabel.sprite);
    this.label = new Label(0.3, 4);
    this.island.add(this.label.sprite);
    this.handHint = handHintMesh();
    this.island.add(this.handHint);
    this.ring = ringHint();
    this.island.add(this.ring);
    this.handVisual = new HandVisual();
    this.island.add(this.handVisual.group);
    this.motes = new Motes(220);
    this.island.add(this.motes.points);

    this.placeIsland(false);
  }

  private folkEvents(zone: Zone): FolkEvents {
    return {
      wake: (f) => {
        sound.unlock();
        sound.wake(this.pan(f.position));
        this.motes.burst(f.position.x, f.position.y + 0.03, f.position.z, 14, 0.02, 0.04);
        if (this.phase === 'intro') this.setPhase('play');
      },
      step: (f) => sound.step(this.pan(f.position)),
      hop: (f) => sound.hop(this.pan(f.position)),
      worry: (f) => sound.call(this.pan(f.position)),
      cheer: (f) => sound.cheer(this.pan(f.position)),
      arrive: (f) => {
        sound.arrive();
        this.motes.burst(f.position.x, f.position.y + 0.03, f.position.z, 24, 0.03, 0.07);
        for (const l of zone.lanterns) l.orbMat.color.setHex(f.plan.tint);
        this.onRescue(f);
        if (zone.folk.every((x) => x.isSeated)) this.completeLevel();
      },
    };
  }

  /** Order in which spirits came home (they remember, and so does the grove). */
  private rescued: Folk[] = [];

  /** Every rescue visibly and audibly warms the grove. */
  private onRescue(f: Folk) {
    this.rescued.push(f);
    const n = this.rescued.length;
    sound.setWarmth(n >= 4 ? 3 : n);
    // The friends already home celebrate the newcomer, one after another.
    this.rescued.forEach((other, i) => {
      if (other !== f) this.later(0.35 + i * 0.25, () => other.cheer());
    });
    // A branch lantern lights up for each spirit, in its own colour.
    const lamp = this.treeLanterns[Math.min(n - 1, this.treeLanterns.length - 1)];
    if (lamp) {
      (lamp.material as SpriteMaterial).color.setHex(f.plan.tint);
      lamp.userData.lit = 1;
    }
  }

  private timers: { at: number; fn: () => void }[] = [];
  private clock = 0;
  private later(seconds: number, fn: () => void) {
    this.timers.push({ at: this.clock + seconds, fn });
  }
  private runTimers(dt: number) {
    this.clock += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.timers[i].at <= this.clock) {
        const t = this.timers[i];
        this.timers.splice(i, 1);
        t.fn();
      }
    }
  }

  /** More fireflies drift up as more spirits come home. */
  private updateFireflies(dt: number) {
    const n = this.rescued.length;
    if (n === 0 || this.phase === 'finale') return;
    if (Math.random() < dt * n * 0.9) {
      const a = Math.random() * Math.PI * 2;
      const d = 0.05 + Math.random() * 0.3;
      this.motes.burst(Math.cos(a) * d, -0.02 + Math.random() * 0.05, Math.sin(a) * d, 1, 0.01, 0.025);
    }
    // Lit branch lanterns breathe softly.
    this.treeLanterns.forEach((g, i) => {
      if (!g.userData.lit || this.phase === 'finale' || this.phase === 'ending') return;
      (g.material as SpriteMaterial).opacity = 0.75 + 0.2 * Math.sin(this.clock * 2 + i);
    });
    this.tree.canopyMat.emissiveIntensity = Math.max(this.tree.canopyMat.emissiveIntensity, n * 0.04);
  }

  /** Viewer position and "who to watch" for the spirits' acting layer. */
  private updateCommunity() {
    this.camera.getWorldPosition(this.tmp);
    this.island.worldToLocal(this.tmp);
    const zone = this.zones[this.level];
    const active = zone?.folk.find((f) => f.isAwake && !f.isSeated) ?? null;
    for (const z of this.zones) {
      for (const f of z.folk) {
        f.viewer.x = this.tmp.x;
        f.viewer.y = this.tmp.y;
        f.viewer.z = this.tmp.z;
        f.watch = active ? active.position : null;
      }
    }
  }

  /* ---- hands-only music toggle: a small moon-bell beside the grove ---- */
  private bell!: ReturnType<typeof pathLantern>;
  private bellLocal = v3();
  private bellArmed = true;
  private bellLabel!: Label;
  private bellLabelTimer = 0;

  private updateMusicBell(dt: number) {
    // Fixed to the left-front of the grove (does not spin with level changes).
    const yaw = this.yaw;
    const bx = -0.2;
    const bz = 0.17;
    const c = Math.cos(-yaw);
    const sn = Math.sin(-yaw);
    this.bellLocal.x = bx * c + bz * sn;
    this.bellLocal.z = -bx * sn + bz * c;
    this.bellLocal.y = 0.05 + Math.sin(this.clock * 1.5) * 0.003;
    this.bell.group.position.set(this.bellLocal.x, this.bellLocal.y - 0.029 * 1.4, this.bellLocal.z);
    const on = !sound.musicMuted;
    this.bell.orbMat.color.setHex(on ? 0xffd27a : 0x4b5285);
    (this.bell.glow.material as SpriteMaterial).opacity = on ? 0.55 + 0.15 * Math.sin(this.clock * 2) : 0.12;
    const poking = isPoking(this.hands.hands, this.bellLocal);
    if (poking && this.bellArmed && this.phase !== 'boot') {
      this.bellArmed = false;
      sound.unlock();
      sound.setMusicMuted(on);
      sound.pickup();
      this.bellLabel.show(on ? 'Music off' : 'Music on', '');
      this.bellLabelTimer = 1.6;
    } else if (!poking) {
      let far = true;
      for (const h of this.hands.hands) if (h.present && dist3(h.indexTip, this.bellLocal) < 0.07) far = false;
      if (far) this.bellArmed = true;
    }
    this.bellLabelTimer -= dt;
    if (this.bellLabelTimer <= 0) this.bellLabel.hide();
    this.bellLabel.sprite.position.set(this.bellLocal.x, this.bellLocal.y + 0.05, this.bellLocal.z);
    this.bellLabel.update(dt);
  }

  /** Stereo pan from island-local x relative to the viewer. */
  private pan(p: V3) {
    this.tmp.set(p.x, p.y, p.z);
    this.island.localToWorld(this.tmp);
    this.camera.getWorldPosition(this.tmp2);
    return Math.max(-0.8, Math.min(0.8, (this.tmp.x - this.tmp2.x) * 4));
  }

  /**
   * Put the grove at a comfortable seated reach: ~62 cm ahead, ~36 cm below
   * the eyes, facing the viewer. Re-run at every level so posture changes and
   * recentring never strand the player.
   */
  private placeIsland(smooth: boolean) {
    const head = this.tmp;
    this.camera.getWorldPosition(head);
    const fwd = this.tmp2;
    this.camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    const target = new Vector3(head.x + fwd.x * 0.62, head.y - 0.36, head.z + fwd.z * 0.62);
    target.y = Math.max(0.45, target.y);
    const parent = this.island.parent!;
    if (smooth && this.placed) {
      parent.userData.from = parent.position.clone();
      parent.userData.to = target;
    } else {
      parent.position.copy(target);
      parent.userData.from = undefined;
    }
    this.yawFacing = Math.atan2(-fwd.x, -fwd.z);
    this.placed = true;
  }
  private yawFacing = 0;

  /* ---------------------------------------------------------------- flow */

  private startGame() {
    this.level = 0;
    this.zones.forEach((z) => {
      z.bloom = 0;
      z.bloomTarget = 0;
      z.folk.forEach((f) => f.reset());
      z.flowers.setBloom(0);
      z.lanterns.forEach((l) => {
        l.orbMat.color.setHex(0x3a3f66);
        (l.glow.material as SpriteMaterial).opacity = 0;
      });
    });
    this.resetLeaf();
    this.starPlaced = false;
    this.starHeld = -1;
    copyV3(this.starPos, STAR_START);
    this.star.group.visible = false;
    this.replay.group.visible = false;
    this.tree.canopyMat.emissiveIntensity = 0;
    this.treeLight.intensity = 0;
    this.treeLanterns.forEach((g) => {
      (g.material as SpriteMaterial).opacity = 0;
      (g.material as SpriteMaterial).color.setHex(0xffe9a8);
      g.userData.lit = 0;
    });
    this.rescued = [];
    this.timers = [];
    sound.setWarmth(0);
    this.yaw = -LEVELS[0].angle;
    this.setPhase('intro');
    sound.resetSteps();
  }

  private resetLeaf() {
    const plan = LEVELS[2];
    copyV3(this.leafHome, plan.leafStart!);
    copyV3(this.leafPos, plan.leafStart!);
    this.leafHeld = -1;
    this.leafPlaced = false;
    this.leafReturn = 0;
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.phaseTime = 0;
    this.hintCooldown = 0;
  }

  private completeLevel() {
    const z = this.zones[this.level];
    z.bloomTarget = 1;
    sound.bloom();
    this.setPhase('celebrate');
  }

  private goToLevel(i: number) {
    this.level = i;
    this.yawFrom = this.yaw;
    this.yawTo = -LEVELS[i].angle;
    // always rotate the same way (counter-clockwise reveal)
    while (this.yawTo > this.yawFrom) this.yawTo -= Math.PI * 2;
    // The grove stays where it was placed (XR start or headset recentre): re-placing
    // at every level would follow wherever the player happened to glance.
    this.setPhase('transition');
  }

  /* -------------------------------------------------------------- update */

  update(delta: number, time: number) {
    const dt = Math.min(delta, 0.05);
    const inXR = !!this.world.xrSession;
    if (inXR !== this.wasInXR) {
      this.wasInXR = inXR;
      if (inXR) {
        sound.unlock();
        sound.startAmbience();
        this.pendingPlace = 2; // wait for a valid head pose
      } else {
        sound.stopAmbience();
        this.placeIsland(false);
      }
    }
    if (this.pendingPlace > 0) {
      this.pendingPlace--;
      if (this.pendingPlace === 0) {
        this.placeIsland(false);
        this.reveal = 0.0001; // cold-open: the grove rises into place
        this.titleTime = 0;
        this.watchRecentre();
      }
    }
    if (this.recentreRequested) {
      this.recentreRequested = false;
      this.placeIsland(false);
    }
    if (this.paused) return;
    if (!inXR) this.desktopPreview(time);
    this.phaseTime += dt;
    this.hands.update(this.island, dt);
    const hands = this.hands.hands;

    this.updateIslandTransform(dt);
    for (const z of this.zones) {
      for (const f of z.folk) {
        f.leafPlaced = this.leafPlaced;
        f.update(dt, hands);
      }
    }
    const carrying = this.zones.some((z) => z.folk.some((f) => f.state === 'ride' || f.state === 'bridge'));
    this.highlight[0] = carrying || this.leafHeld === 0 || this.starHeld === 0;
    this.highlight[1] = carrying || this.leafHeld === 1 || this.starHeld === 1;
    this.handVisual.update(hands, dt, this.highlight);
    this.hideStockHands(dt);
    this.runTimers(dt);
    this.updateCommunity();
    this.updateFlow(dt);
    this.updateMusicBell(dt);
    this.updateFireflies(dt);
    this.updateLeaf(dt);
    this.updateStar(dt);
    this.updateHints(dt, time);
    this.updateBloom(dt, time);
    if (!inXR) this.label.hide();
    this.label.update(dt);
    this.motes.update(dt, time);
    this.updateNoHands(inXR);
  }
  private pendingPlace = 0;
  private titleTime = 0;

  /** Outside VR: a slow orbit around the grove as a living title screen. */
  private desktopPreview(time: number) {
    const c = this.island.parent!.position;
    const a = time * 0.12;
    this.camera.position.set(c.x + Math.sin(a) * 0.95, c.y + 0.42, c.z + Math.cos(a) * 0.95);
    this.camera.lookAt(c.x, c.y - 0.1, c.z);
  }
  private reveal = 1;
  private recentreRequested = false;
  private watchedSpace: XRReferenceSpace | null = null;

  /** Re-place the grove when the player recentres their headset. */
  private watchRecentre() {
    const space = this.world.xrReferenceSpace;
    if (!space || space === this.watchedSpace) return;
    this.watchedSpace = space;
    space.addEventListener('reset', () => (this.recentreRequested = true));
  }
  private stockHandTimer = 0;

  /** Our moonlit hand replaces the SDK's outline hand (which also occludes it). */
  private hideStockHands(dt: number) {
    void dt;
    const hv = this.input.xr.visualAdapters?.hand as
      | Record<'left' | 'right', { toggleVisual(v: boolean): void; visual?: { model?: { visible: boolean } } }>
      | undefined;
    if (!hv) return;
    for (const side of ['left', 'right'] as const) {
      const a = hv[side];
      if (!a) continue;
      if (this.stockHandTimer <= 0) a.toggleVisual(false);
      const model = a.visual?.model;
      if (model && model.visible) model.visible = false;
    }
    if (this.stockHandTimer <= 0) {
      // Lanternfolk is touch/palm/pinch only: hide the SDK's far-pointer ray visuals.
      this.player.traverse((o) => {
        const m = (o as { material?: { uniforms?: Record<string, unknown> } }).material;
        if (m?.uniforms && 'endValue' in m.uniforms) o.visible = false;
      });
    }
    this.stockHandTimer = this.stockHandTimer <= 0 ? 1 : this.stockHandTimer - dt;
  }

  private updateIslandTransform(dt: number) {
    const parent = this.island.parent!;
    if (parent.userData.from) {
      const u = smoothstep(Math.min(1, this.phaseTime / 2.4));
      parent.position.lerpVectors(parent.userData.from, parent.userData.to, u);
      if (u >= 1) parent.userData.from = undefined;
    }
    parent.rotation.y = this.yawFacing;
    this.island.rotation.y = this.yaw;
    // Gentle float.
    let rise = 0;
    if (this.reveal < 1) {
      const before = this.reveal;
      this.reveal = Math.min(1, this.reveal + dt / 2.8);
      const e = smoothstep(this.reveal);
      rise = (1 - e) * -0.22;
      this.island.scale.setScalar(0.75 + 0.25 * e);
      if (before < 0.55 && this.reveal >= 0.55) {
        this.motes.burst(0, 0.05, 0, 40, 0.3, 0.06);
        sound.bloom();
      }
    }
    this.island.position.y = rise + Math.sin((performance.now() / 1000) * 0.6) * 0.002;
    void dt;
  }

  private updateFlow(dt: number) {
    const plan = LEVELS[this.level];
    const zone = this.zones[this.level];
    switch (this.phase) {
      case 'intro': {
        if (this.reveal < 0.9) {
          this.label.hide();
        } else if (this.level === 0) {
          this.titleTime += 1 / 60;
          this.label.show(this.titleTime < 4 ? 'Lanternfolk' : plan.intro[0], plan.intro[1]);
        }
        else this.label.show(plan.intro[0], plan.intro[1]);
        this.positionLabel(plan.label);
        break;
      }
      case 'play': {
        const needer = zone.folk.find((f) => f.help);
        const sleeper = zone.folk.find((f) => !f.isAwake);
        if (sleeper) {
          this.label.show(plan.intro[0], plan.intro[1]);
        } else if (needer && needer.waitTime > 0.6) {
          this.label.show(plan.help[0], plan.help[1]);
        } else if (this.phaseTime > 1.5) {
          this.label.hide();
        }
        this.positionLabel(plan.label);
        break;
      }
      case 'celebrate': {
        this.label.show(['', 'The first light is home', 'Two lights shine', 'Every light is home'][this.level + 1] ?? 'Home', '');
        if (this.phaseTime > 3.2) {
          this.label.hide();
          if (this.level < LEVELS.length - 1) this.goToLevel(this.level + 1);
          else {
            this.star.group.visible = true;
            this.motes.burst(STAR_START.x, STAR_START.y, STAR_START.z, 30, 0.03, 0.05);
            sound.pickup();
            this.setPhase('star');
          }
        }
        break;
      }
      case 'transition': {
        const T = 2.6;
        const u = smoothstep(Math.min(1, this.phaseTime / T));
        this.yaw = this.yawFrom + (this.yawTo - this.yawFrom) * u;
        if (u >= 1) {
          this.yaw = this.yawTo;
          // Later levels show their wake prompt from the 'play' phase.
          this.setPhase('play');
        }
        break;
      }
      case 'star': {
        if (this.starPlaced) {
          this.label.hide();
          this.setPhase('finale');
          sound.finale();
          sound.musicFinale();
          this.zones.forEach((z) => (z.bloomTarget = 1));
          this.startFinaleChoreography();
        } else {
          this.label.show('One last light', 'Pinch the star and set it atop the tree');
          this.positionLabel(v3(STAR_START.x, 0.2, STAR_START.z));
        }
        break;
      }
      case 'finale': {
        const u = Math.min(1, this.phaseTime / 4);
        this.tree.canopyMat.emissiveIntensity = Math.max(0.12, u * 0.2);
        this.treeLight.intensity = u * 0.55;
        // Light travels up through the branches, one lantern after another.
        this.treeLanterns.forEach((g, i) => {
          const k = smoothstep((this.phaseTime - 0.5 - 0.35 * i) / 0.8);
          const m = g.material as SpriteMaterial;
          if (k > 0 && !g.userData.lit) m.color.setHex(0xffe9a8);
          m.opacity = Math.max(g.userData.lit ? 0.8 : 0, k * (0.8 + 0.2 * Math.sin(this.phaseTime * 3 + i)));
        });
        if (Math.random() < dt * 30) {
          const a = Math.random() * Math.PI * 2;
          const d = 0.03 + Math.random() * 0.12;
          this.motes.burst(Math.cos(a) * d, 0.12 + Math.random() * 0.12, Math.sin(a) * d, 2, 0.02, 0.05);
        }
        if (this.phaseTime > 2.5 && this.phaseTime < 6.5) {
          this.label.show('The grove is awake', '');
          this.positionLabel(v3(0, 0.36, 0));
        } else if (this.phaseTime >= 6.5) {
          this.label.show('Thank you', 'for lending a hand');
          this.positionLabel(v3(0, 0.33, 0));
        }
        if (this.phaseTime > 12) {
          this.setPhase('ending');
          this.replay.group.visible = true;
        }
        break;
      }
      case 'ending': {
        // Replay lantern floats in front of the tree in the active zone.
        const a = LEVELS[this.level].angle;
        this.replayPos.x = Math.sin(a) * 0.17;
        this.replayPos.z = Math.cos(a) * 0.17;
        this.replayPos.y = 0.045 + Math.sin(this.phaseTime * 2) * 0.004;
        this.replay.group.position.set(this.replayPos.x - 0.0, this.replayPos.y - 0.064, this.replayPos.z);
        this.replay.orbMat.color.setHex(0xffd27a);
        (this.replay.glow.material as SpriteMaterial).opacity = 0.7 + 0.3 * Math.sin(this.phaseTime * 3);
        this.label.show('Play again?', 'Touch the lantern');
        this.positionLabel(v3(this.replayPos.x, 0.13, this.replayPos.z));
        if (this.phaseTime > 1 && isPoking(this.hands.hands, this.replayPos)) {
          sound.wake();
          this.replay.group.visible = false;
          this.restartFromEnding();
        }
        // keep the canopy glowing
        this.tree.canopyMat.emissiveIntensity = 0.2;
        break;
      }
    }
  }

  /** Spirits gather around the lit tree, celebrate, and the first friend says thank you. */
  private startFinaleChoreography() {
    this.camera.getWorldPosition(this.tmp);
    this.island.worldToLocal(this.tmp);
    const toViewer = Math.atan2(this.tmp.x, this.tmp.z);
    const all = this.rescued.length ? this.rescued : this.zones.flatMap((z) => z.folk);
    const ring = all.length;
    all.forEach((f, i) => {
      // Fan out in a crescent on the viewer's side of the tree.
      const a = toViewer + (i - (ring - 1) / 2) * 0.55;
      this.later(1.2 + i * 0.3, () => f.gatherAt(v3(Math.sin(a) * 0.075, 0, Math.cos(a) * 0.075)));
      this.later(3.6 + i * 0.25, () => f.cheer(1.2));
      this.later(5.4 + i * 0.25, () => f.cheer(1));
    });
    const first = all[0];
    if (first) {
      this.later(6.4, () => {
        first.thankAt(v3(Math.sin(toViewer) * 0.115, 0, Math.cos(toViewer) * 0.115));
        sound.wake(0);
      });
    }
  }

  private restartFromEnding() {
    this.startGame();
    this.yaw = this.yawTo; // stay where we are, then sweep to level 1
    this.yawFrom = this.yaw;
    this.goToLevel(0);
  }

  private positionLabel(p: V3) {
    this.label.sprite.position.set(p.x, p.y + Math.sin(performance.now() / 900) * 0.003, p.z);
  }

  private updateLeaf(dt: number) {
    const g = this.leaf.group;
    const active = this.level === 2 && (this.phase === 'play' || this.phase === 'intro');
    g.visible = this.level === 2 || this.leafPlaced;
    if (!g.visible) return;
    const slot = LEVELS[2].leafSlot!;
    const hands = this.hands.hands;
    const zoneAngle = LEVELS[2].angle;
    if (this.leafPlaced) {
      copyV3(this.leafPos, slot);
      g.rotation.set(0, zoneAngle, 0);
    } else if (this.leafHeld >= 0) {
      const h = hands[this.leafHeld];
      if (!h.present || !h.pinching) {
        // Released.
        this.leafHeld = -1;
        if (canSnap(this.leafPos, slot)) {
          this.leafPlaced = true;
          sound.place();
          this.motes.burst(slot.x, slot.y + 0.01, slot.z, 22, 0.08, 0.04);
        } else {
          copyV3(this.dropFrom, this.leafPos);
          this.leafReturn = 0.0001;
        }
      } else {
        lerpV3(this.leafPos, this.leafPos, h.pinchPoint, Math.min(1, dt * 25));
        // Preview the snap: align when close.
        const near = canSnap(this.leafPos, slot);
        g.rotation.set(0, zoneAngle + (near ? 0 : 0.5), near ? 0 : 0.25);
      }
    } else if (this.leafReturn > 0) {
      this.leafReturn += dt;
      const u = smoothstep(this.leafReturn / 1.2);
      lerpV3(this.leafPos, this.dropFrom, this.leafHome, u);
      if (u >= 1) this.leafReturn = 0;
    } else {
      // Resting: bob, and wait to be pinched.
      copyV3(this.leafPos, this.leafHome);
      this.leafPos.y += Math.sin(this.phaseTime * 2) * 0.004;
      g.rotation.set(0, zoneAngle + 0.5 + Math.sin(this.phaseTime) * 0.1, 0.25);
      if (active) {
        const h = grabbingHand(hands, this.leafPos, 0.07);
        if (h >= 0) {
          this.leafHeld = h;
          sound.pickup();
        }
      }
    }
    g.position.set(this.leafPos.x, this.leafPos.y, this.leafPos.z);
    (this.leaf.glow.material as SpriteMaterial).opacity = this.leafPlaced ? 0.25 : 0.35 + 0.2 * Math.sin(this.phaseTime * 4);
  }

  private updateStar(dt: number) {
    if (!this.star.group.visible) return;
    const hands = this.hands.hands;
    const g = this.star.group;
    if (this.starPlaced) {
      copyV3(this.starPos, SOCKET);
      this.starPos.y += 0.01 + Math.sin(this.phaseTime * 1.5) * 0.004;
    } else if (this.starHeld >= 0) {
      const h = hands[this.starHeld];
      if (!h.present || !h.pinching) {
        this.starHeld = -1;
        if (canSnap(this.starPos, SOCKET, 0.08)) {
          this.starPlaced = true;
          sound.place();
          this.motes.burst(SOCKET.x, SOCKET.y, SOCKET.z, 40, 0.05, 0.08);
        } else {
          copyV3(this.dropFrom, this.starPos);
          this.starReturn = 0.0001;
        }
      } else {
        lerpV3(this.starPos, this.starPos, h.pinchPoint, Math.min(1, dt * 25));
      }
    } else if (this.starReturn > 0) {
      this.starReturn += dt;
      const u = smoothstep(this.starReturn / 1.2);
      lerpV3(this.starPos, this.dropFrom, STAR_START, u);
      if (u >= 1) this.starReturn = 0;
    } else {
      copyV3(this.starPos, STAR_START);
      this.starPos.y += Math.sin(this.phaseTime * 2) * 0.005;
      if (this.phase === 'star') {
        const h = grabbingHand(hands, this.starPos, 0.07);
        if (h >= 0) {
          this.starHeld = h;
          sound.pickup();
        }
      }
    }
    g.position.set(this.starPos.x, this.starPos.y, this.starPos.z);
    this.star.core.rotation.y += dt * 1.2;
    const s = this.starPlaced ? 0.22 + Math.sin(this.phaseTime * 2) * 0.02 : 0.14;
    this.star.glow.scale.set(s, s, s);
  }

  /** Hints escalate gently: nothing for a moment, then a ring or a ghost hand. */
  private updateHints(dt: number, time: number) {
    const ringMat = this.ring.material as MeshBasicMaterial;
    const handMat = this.handHint.material as MeshBasicMaterial;
    let ringTarget = 0;
    let handTarget = 0;
    const plan = LEVELS[this.level];
    const zone = this.zones[this.level];
    if (this.phase === 'intro' || this.phase === 'play') {
      const sleeper = zone.folk.find((f) => !f.isAwake);
      const needer = zone.folk.find((f) => f.help && f.waitTime > 1.2);
      if (sleeper) {
        ringTarget = this.phaseTime > 1.2 ? 0.9 : 0;
        const p = sleeper.touchPoint;
        this.ring.position.set(p.x, p.y, p.z);
        this.ring.lookAt(this.cameraLocal());
        const s = 1 + 0.25 * Math.sin(time * 4);
        this.ring.scale.setScalar(s);
      } else if (needer) {
        if (needer.help === 'leaf' && !this.leafPlaced) {
          ringTarget = 0.9;
          this.ring.position.set(this.leafPos.x, this.leafPos.y, this.leafPos.z);
          this.ring.lookAt(this.cameraLocal());
          this.ring.scale.setScalar(1.6 + 0.3 * Math.sin(time * 4));
          if (this.leafHeld >= 0) {
            ringTarget = 0.9;
            const slot = plan.leafSlot!;
            this.ring.position.set(slot.x, slot.y + 0.004, slot.z);
            this.ring.rotation.set(-Math.PI / 2, 0, 0);
            this.ring.scale.setScalar(2.2 + 0.3 * Math.sin(time * 5));
          }
        } else if (needer.help === 'bridge' || needer.help === 'lift') {
          handTarget = this.handNear(plan.hint, 0.09) ? 0 : 0.55;
          const from = plan.hint;
          if (plan.hintTo) {
            const u = (time * 0.45) % 1;
            const e = smoothstep(u);
            this.handHint.position.set(
              from.x + (plan.hintTo.x - from.x) * e,
              from.y + (plan.hintTo.y - from.y) * e + Math.sin(e * Math.PI) * 0.03,
              from.z + (plan.hintTo.z - from.z) * e,
            );
            handTarget *= Math.sin(u * Math.PI);
          } else {
            this.handHint.position.set(from.x, from.y + Math.sin(time * 2) * 0.004, from.z);
          }
          // Lay the ghost hand across the gap, fingers pointing sideways.
          this.handHint.rotation.set(-Math.PI / 2, 0, plan.angle + Math.PI / 2);
        }
      }
    } else if (this.phase === 'star' && this.starHeld < 0 && !this.starPlaced) {
      ringTarget = 0.9;
      this.ring.position.set(this.starPos.x, this.starPos.y, this.starPos.z);
      this.ring.lookAt(this.cameraLocal());
      this.ring.scale.setScalar(1.8 + 0.3 * Math.sin(time * 4));
    } else if (this.phase === 'star' && this.starHeld >= 0) {
      ringTarget = 0.9;
      this.ring.position.set(SOCKET.x, SOCKET.y, SOCKET.z);
      this.ring.rotation.set(-Math.PI / 2, 0, 0);
      this.ring.scale.setScalar(1.6 + 0.3 * Math.sin(time * 5));
    }
    ringMat.opacity += (ringTarget * (0.6 + 0.4 * Math.sin(time * 4)) - ringMat.opacity) * Math.min(1, dt * 6);
    handMat.opacity += (handTarget - handMat.opacity) * Math.min(1, dt * 4);
    this.ring.visible = ringMat.opacity > 0.01;
    this.handHint.visible = handMat.opacity > 0.01;
  }

  private handNear(p: V3, r: number) {
    for (const h of this.hands.hands) {
      if (!h.present) continue;
      const j = h.joints;
      if (Math.hypot(j[33] - p.x, j[34] - p.y, j[35] - p.z) < r) return true; // middle knuckle
    }
    return false;
  }

  private camLocal = new Vector3();
  /** Camera position in world space (Object3D.lookAt takes world coordinates). */
  private cameraLocal() {
    return this.camera.getWorldPosition(this.camLocal);
  }

  private updateBloom(dt: number, time: number) {
    for (const z of this.zones) {
      z.bloom += (z.bloomTarget - z.bloom) * Math.min(1, dt * 1.2);
      z.mat.color.copy(DORMANT).lerp(ALIVE, z.bloom);
      z.flowers.setBloom(z.bloom);
      z.lanterns.forEach((l, i) => {
        const lit = z.folk.some((f) => f.isAwake) ? Math.min(1, z.bloom * 2 + (z.folk.some((f) => f.isSeated || f.state === 'bridge' || f.state === 'ride') ? 0.6 : 0.25)) : 0;
        (l.glow.material as SpriteMaterial).opacity = lit * (0.75 + 0.25 * Math.sin(time * 2 + i));
        if (lit > 0.2 && z.bloom < 0.01) l.orbMat.color.setHex(0xffd27a);
      });
    }
    const all = this.zones.reduce((a, z) => a + z.bloom, 0) / this.zones.length;
    const centre = this.zones[0].mat.userData.centre as MeshLambertMaterial;
    centre.color.copy(DORMANT).lerp(ALIVE, 0.35 + 0.65 * all);
    this.hemi.intensity = 1.35 + all * 0.25;
    this.skyStars.starsMat.opacity = 0.9 - all * 0.3;
  }

  private updateNoHands(inXR: boolean) {
    if (!inXR) return;
    const missing = this.hands.lostFor > 2.5;
    if (missing && !this.noHandsShown) {
      this.noHandsShown = true;
      this.label.show('Use your hands', 'Set controllers down — hands are tracked automatically');
      this.positionLabel(v3(Math.sin(LEVELS[this.level].angle) * 0.2, 0.14, Math.cos(LEVELS[this.level].angle) * 0.2));
    } else if (!missing && this.noHandsShown) {
      this.noHandsShown = false;
      this.label.hide();
    }
  }

  /* --------------------------------------------------------------- debug */

  private exposeDebug() {
    const self = this;
    const debug: GameDebug = {
      get phase() {
        return self.phase;
      },
      get level() {
        return self.level;
      },
      get musicMuted() {
        return sound.musicMuted;
      },
      get rescued() {
        return self.rescued.length;
      },
      get folk() {
        return self.zones.flatMap((z) =>
          z.folk.map((f) => {
            const w = self.toWorld(f.position);
            return { state: f.state, help: f.help, x: w[0], y: w[1], z: w[2] };
          }),
        );
      },
      get targets() {
        const t: Record<string, [number, number, number]> = {};
        self.zones.forEach((z, i) => {
          z.folk.forEach((f, j) => (t[`folk${i + 1}${'ab'[j]}`] = self.toWorld(f.touchPoint)));
          const plan = z.plan;
          t[`hint${i + 1}`] = self.toWorld(plan.hint);
          if (plan.hintTo) t[`hintTo${i + 1}`] = self.toWorld(plan.hintTo);
        });
        t.leaf = self.toWorld(self.leafPos);
        t.leafSlot = self.toWorld(LEVELS[2].leafSlot!);
        t.star = self.toWorld(self.starPos);
        t.socket = self.toWorld(SOCKET);
        t.replay = self.toWorld(self.replayPos);
        t.bell = self.toWorld(self.bellLocal);
        return t;
      },
      skipTo(level: number) {
        self.startGame();
        if (level <= 0) return;
        for (let i = 0; i < level; i++) {
          self.zones[i].folk.forEach((f) => {
            (f as unknown as { state: string }).state = 'seated';
            copyV3(f.position, f.plan.seat);
            self.rescued.push(f);
          });
          self.zones[i].bloomTarget = 1;
          self.zones[i].bloom = 1;
        }
        if (level >= 3) {
          self.level = 2;
          self.leafPlaced = true;
          self.yaw = -LEVELS[2].angle;
          self.star.group.visible = true;
          self.setPhase('star');
          return;
        }
        self.level = level;
        self.yaw = -LEVELS[level].angle;
        self.setPhase('play');
      },
      restart() {
        self.startGame();
      },
      probe(level: number) {
        const seg = LEVELS[level].folk[0].route.find((r) => r.kind === 'lift' || r.kind === 'bridge');
        const pad = seg?.kind === 'lift' ? seg.from : seg?.kind === 'bridge' ? seg.span.from : v3();
        const out = { y: 0, hand: -1 };
        supportAt(pad.x, pad.z, self.hands.hands, out);
        const h = self.hands.hands.map((x) => ({
          present: x.present,
          minDxz: Math.min(...Array.from({ length: 25 }, (_, i) => Math.hypot(x.joints[i * 3] - pad.x, x.joints[i * 3 + 2] - pad.z))),
          wristY: x.joints[1],
        }));
        return { pad, sup: out, hands: h };
      },
      recenter() {
        self.placeIsland(false);
      },
      simulateTrackingLoss(seconds: number) {
        self.hands.suppressFor = seconds;
      },
      reveal() {
        self.placeIsland(false);
        self.reveal = 0.0001;
        self.titleTime = 0;
      },
    };
    (window as unknown as { lanternfolk: GameDebug }).lanternfolk = debug;
    (window as unknown as { __lf: unknown }).__lf = this;
  }

  private toWorld(p: V3): [number, number, number] {
    this.island.updateWorldMatrix(true, false);
    this.tmp.set(p.x, p.y, p.z);
    this.island.localToWorld(this.tmp);
    // Convert to XR-origin space (what the emulator CLI expects).
    this.world.player.updateWorldMatrix(true, false);
    this.world.player.worldToLocal(this.tmp);
    return [this.tmp.x, this.tmp.y, this.tmp.z];
  }
}

void dist3;
