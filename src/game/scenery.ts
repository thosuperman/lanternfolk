/**
 * Procedural low-poly scenery. Static pieces are merged into a handful of
 * vertex-coloured meshes so the whole diorama costs only a few draw calls on
 * standalone hardware.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';

/* ---------------------------------------------------------------- utils -- */

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

const _m = new Matrix4();
const _q = new Quaternion();
const _s = new Vector3();
const _p = new Vector3();
const _c = new Color();

/** Collects coloured primitives and merges them into one geometry. */
export class GeoBatch {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];

  add(
    geo: BufferGeometry,
    color: number | Color,
    position: [number, number, number] = [0, 0, 0],
    rotation: [number, number, number] = [0, 0, 0],
    scale: [number, number, number] | number = 1,
    jitter?: { amount: number; rand: () => number; colorVar?: number },
  ) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    _q.setFromAxisAngle(new Vector3(1, 0, 0), rotation[0]);
    _q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), rotation[1]));
    _q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), rotation[2]));
    if (typeof scale === 'number') _s.set(scale, scale, scale);
    else _s.set(scale[0], scale[1], scale[2]);
    _p.set(position[0], position[1], position[2]);
    _m.compose(_p, _q, _s);
    if (jitter) {
      // Displace shared vertices consistently so faces stay closed.
      const a = g.attributes.position as BufferAttribute;
      const cache = new Map<string, [number, number, number]>();
      for (let i = 0; i < a.count; i++) {
        const key = `${a.getX(i).toFixed(4)},${a.getY(i).toFixed(4)},${a.getZ(i).toFixed(4)}`;
        let d = cache.get(key);
        if (!d) {
          d = [
            (jitter.rand() - 0.5) * jitter.amount,
            (jitter.rand() - 0.5) * jitter.amount,
            (jitter.rand() - 0.5) * jitter.amount,
          ];
          cache.set(key, d);
        }
        a.setXYZ(i, a.getX(i) + d[0], a.getY(i) + d[1], a.getZ(i) + d[2]);
      }
    }
    g.applyMatrix4(_m);
    g.computeVertexNormals();
    const p = g.attributes.position as BufferAttribute;
    const n = g.attributes.normal as BufferAttribute;
    _c.set(color as Color);
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      let k = 1;
      if (jitter?.colorVar && i % 3 === 0) k = 1 + (jitter.rand() - 0.5) * jitter.colorVar;
      this.col.push(_c.r * k, _c.g * k, _c.b * k);
      if (i % 3 === 2 && jitter?.colorVar) {
        // keep each triangle a single flat colour
        const L = this.col.length;
        for (let j = 0; j < 3; j++) {
          this.col[L - 3 + j] = this.col[L - 9 + j];
          this.col[L - 6 + j] = this.col[L - 9 + j];
        }
      }
    }
    g.dispose();
    return this;
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new BufferAttribute(new Float32Array(this.nor), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.col), 3));
    g.computeBoundingSphere();
    return g;
  }
}

export function flatMaterial(emissive = 0x000000, emissiveIntensity = 0) {
  return new MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    emissive,
    emissiveIntensity,
  });
}

/* ------------------------------------------------------------ textures -- */

let glowTex: CanvasTexture | null = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTex = new CanvasTexture(c);
  glowTex.colorSpace = SRGBColorSpace;
  return glowTex;
}

export function glowSprite(color: number, size: number, opacity = 1) {
  const s = new Sprite(
    new SpriteMaterial({
      map: glowTexture(),
      color,
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity,
    }),
  );
  s.scale.set(size, size, size);
  s.renderOrder = 10;
  return s;
}

/** Text drawn into a canvas and shown on a camera-facing sprite. */
export class Label {
  readonly sprite: Sprite;
  private canvas: HTMLCanvasElement;
  private tex: CanvasTexture;
  private current = '';
  opacity = 0;
  target = 0;

  constructor(private widthM = 0.3, private aspect = 4) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = Math.round(1024 / aspect);
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.sprite = new Sprite(
      new SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false, opacity: 0 }),
    );
    this.sprite.scale.set(widthM, widthM / aspect, 1);
    this.sprite.renderOrder = 20;
  }

  set(title: string, sub = '') {
    const key = title + '|' + sub;
    if (key === this.current) return;
    this.current = key;
    const g = this.canvas.getContext('2d')!;
    const W = this.canvas.width;
    const H = this.canvas.height;
    g.clearRect(0, 0, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = 'rgba(10,8,40,0.9)';
    g.shadowBlur = 18;
    const hasSub = sub.length > 0;
    g.fillStyle = '#fff4d6';
    g.font = `600 ${hasSub ? Math.round(H * 0.36) : Math.round(H * 0.42)}px "Trebuchet MS", "Segoe UI", sans-serif`;
    g.fillText(title, W / 2, hasSub ? H * 0.36 : H / 2, W * 0.94);
    if (hasSub) {
      g.fillStyle = '#c9d4ff';
      g.font = `400 ${Math.round(H * 0.2)}px "Trebuchet MS", "Segoe UI", sans-serif`;
      g.fillText(sub, W / 2, H * 0.76, W * 0.94);
    }
    this.tex.needsUpdate = true;
  }

  show(title: string, sub = '') {
    this.set(title, sub);
    this.target = 1;
  }

  hide() {
    this.target = 0;
  }

  update(dt: number) {
    this.opacity += (this.target - this.opacity) * Math.min(1, dt * 3);
    (this.sprite.material as SpriteMaterial).opacity = this.opacity;
    this.sprite.visible = this.opacity > 0.01;
  }
}

/** Translucent hand silhouette used for gentle "put your hand here" hints. */
export function handHintMesh() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(255,240,200,0.9)';
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 6;
  // palm
  g.beginPath();
  g.ellipse(128, 160, 52, 58, 0, 0, Math.PI * 2);
  g.fill();
  // fingers
  const fingers: [number, number, number, number][] = [
    [86, 98, 15, 46],
    [110, 82, 15, 58],
    [136, 80, 15, 60],
    [160, 92, 14, 50],
  ];
  for (const [x, y, w, h] of fingers) {
    g.beginPath();
    g.roundRect(x - w / 2 + 6, y - h, w, h + 40, w / 2);
    g.fill();
  }
  // thumb
  g.save();
  g.translate(70, 170);
  g.rotate(-0.9);
  g.beginPath();
  g.roundRect(-14, -48, 26, 60, 13);
  g.fill();
  g.restore();
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const m = new Mesh(
    new PlaneGeometry(0.17, 0.17),
    new MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
      color: 0xffe6a8,
    }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 15;
  return m;
}

/** Pulsing ring used to mark touch / pinch targets. */
export function ringHint(radius = 0.03) {
  const m = new Mesh(
    new TorusGeometry(radius, 0.0025, 6, 32),
    new MeshBasicMaterial({
      color: 0xfff1c4,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  m.renderOrder = 15;
  return m;
}

/* -------------------------------------------------------------- pieces -- */

const GRASS = 0x5f9f62;
const GRASS2 = 0x4b8a58;
const DIRT = 0x7a5a48;
const ROCK = 0x5b5574;
const ROCK2 = 0x433f5c;

export interface IsletOptions {
  radius: number;
  depth: number;
  seed: number;
  decor?: boolean;
}

/** A floating chunk of land: grassy cap over a jagged rocky cone. */
export function islet(batch: GeoBatch, o: IsletOptions, offset: [number, number, number]) {
  const r = rng(o.seed);
  const [ox, oy, oz] = offset;
  batch.add(new CylinderGeometry(o.radius, o.radius * 0.97, 0.016, 14, 1), GRASS, [ox, oy - 0.008, oz], [0, r() * 6, 0], 1, {
    amount: 0.004,
    rand: r,
    colorVar: 0.18,
  });
  batch.add(new CylinderGeometry(o.radius * 0.985, o.radius * 0.9, 0.02, 14, 1), DIRT, [ox, oy - 0.026, oz], [0, r() * 6, 0], 1, {
    amount: 0.004,
    rand: r,
    colorVar: 0.2,
  });
  batch.add(new ConeGeometry(o.radius * 0.92, o.depth, 9, 2), ROCK, [ox, oy - 0.036 - o.depth / 2, oz], [Math.PI, r() * 6, 0], 1, {
    amount: o.radius * 0.18,
    rand: r,
    colorVar: 0.25,
  });
  // hanging pebbles
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI * 2;
    const d = o.radius * (0.3 + r() * 0.4);
    batch.add(
      new DodecahedronGeometry(0.008 + r() * 0.01, 0),
      ROCK2,
      [ox + Math.cos(a) * d, oy - o.depth * (0.55 + r() * 0.4), oz + Math.sin(a) * d],
      [r() * 3, r() * 3, 0],
    );
  }
  if (o.decor !== false) {
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2;
      const d = o.radius * (0.5 + r() * 0.42);
      const x = ox + Math.cos(a) * d;
      const z = oz + Math.sin(a) * d;
      if (r() < 0.6) {
        batch.add(new ConeGeometry(0.004, 0.014 + r() * 0.01, 4), r() < 0.5 ? GRASS2 : 0x76b46a, [x, oy + 0.006, z], [0.15 * (r() - 0.5), 0, 0.2 * (r() - 0.5)]);
      } else {
        batch.add(new DodecahedronGeometry(0.004 + r() * 0.005, 0), 0x8a85a6, [x, oy + 0.002, z], [r(), r(), r()]);
      }
    }
  }
}

/** Glowing mushrooms; returned as a separate emissive mesh. */
export function mushrooms(spots: [number, number, number][], seed: number) {
  const r = rng(seed);
  const stalks = new GeoBatch();
  const caps = new GeoBatch();
  for (const [x, y, z] of spots) {
    const h = 0.01 + r() * 0.012;
    stalks.add(new CylinderGeometry(0.0018, 0.0026, h, 5), 0xe8e0d0, [x, y + h / 2, z]);
    caps.add(new SphereGeometry(0.0065 + r() * 0.003, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), r() < 0.5 ? 0x6fe3ff : 0xb68cff, [x, y + h, z], [0, 0, 0], [1, 0.75, 1]);
  }
  const g = new Group();
  g.add(new Mesh(stalks.build(), flatMaterial()));
  const capMat = new MeshBasicMaterial({ vertexColors: true });
  g.add(new Mesh(caps.build(), capMat));
  return g;
}

/** Flowers that pop up when an area is restored (2 instanced draw calls per field). */
export class FlowerField {
  readonly group = new Group();
  private stems: InstancedMesh;
  private heads: InstancedMesh;
  private spots: { x: number; y: number; z: number; h: number; delay: number; rot: number }[] = [];
  private m = new Matrix4();
  private q = new Quaternion();
  private p = new Vector3();
  private s = new Vector3();
  private last = -1;

  constructor(spots: [number, number, number][], seed: number) {
    const r = rng(seed);
    const palette = [0xffd36e, 0xff9ec7, 0x9ee7ff, 0xffffff, 0xffb36b];
    const stemGeo = new CylinderGeometry(0.0008, 0.0008, 1, 3);
    stemGeo.translate(0, 0.5, 0);
    const headGeo = new IcosahedronGeometry(0.004, 0);
    this.stems = new InstancedMesh(stemGeo, new MeshBasicMaterial({ color: 0x4f9a5a }), spots.length);
    this.heads = new InstancedMesh(headGeo, new MeshBasicMaterial({ color: 0xffffff }), spots.length);
    spots.forEach(([x, y, z], i) => {
      this.spots.push({ x, y, z, h: 0.012 + r() * 0.012, delay: r() * 1.2, rot: r() * 3 });
      this.heads.setColorAt(i, _c.set(palette[Math.floor(r() * palette.length)]));
    });
    this.group.add(this.stems, this.heads);
    this.setBloom(0);
  }

  /** bloom 0..1: flowers grow in one after another. */
  setBloom(bloom: number) {
    if (Math.abs(bloom - this.last) < 1e-4) return;
    this.last = bloom;
    this.spots.forEach((f, i) => {
      const t = bloom * 2.2 - f.delay;
      const u = Math.max(0.0001, t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
      this.q.identity();
      this.p.set(f.x, f.y, f.z);
      this.s.set(u, f.h * u, u);
      this.m.compose(this.p, this.q, this.s);
      this.stems.setMatrixAt(i, this.m);
      this.q.setFromAxisAngle(_up, f.rot);
      this.p.set(f.x, f.y + f.h * u, f.z);
      this.s.set(u, 0.6 * u, u);
      this.m.compose(this.p, this.q, this.s);
      this.heads.setMatrixAt(i, this.m);
    });
    this.stems.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
  }
}
const _up = new Vector3(0, 1, 0);

/** The great tree at the centre of the grove. */
export function greatTree() {
  const r = rng(7);
  const trunk = new GeoBatch();
  let y = 0;
  let x = 0;
  let z = 0;
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const h = 0.03;
    const rb = 0.024 - i * 0.0028;
    const nx = x + (r() - 0.5) * 0.008;
    const nz = z + (r() - 0.5) * 0.008;
    trunk.add(new CylinderGeometry(rb - 0.0028, rb, h, 7), 0x6b4a3a, [nx, y + h / 2, nz], [0, r() * 3, 0], 1, {
      amount: 0.002,
      rand: r,
      colorVar: 0.2,
    });
    x = nx;
    z = nz;
    y += h * 0.98;
  }
  // roots
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r() * 0.4;
    trunk.add(new ConeGeometry(0.008, 0.05, 5), 0x5d3f31, [Math.cos(a) * 0.026, 0.006, Math.sin(a) * 0.026], [0, -a, -1.25]);
  }
  // branches
  const branchTips: [number, number, number][] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r();
    const by = 0.11 + r() * 0.05;
    const len = 0.06 + r() * 0.03;
    const tip: [number, number, number] = [Math.cos(a) * len * 0.8, by + len * 0.5, Math.sin(a) * len * 0.8];
    branchTips.push(tip);
    const mid: [number, number, number] = [tip[0] / 2, (by + tip[1]) / 2, tip[2] / 2];
    const dir = new Vector3(tip[0], tip[1] - by, tip[2]).normalize();
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir);
    const g = new CylinderGeometry(0.003, 0.007, len, 5);
    g.applyQuaternion(q);
    trunk.add(g, 0x6b4a3a, mid);
  }
  const canopy = new GeoBatch();
  const clusters: [number, number, number][] = [[0, 0.2, 0], ...branchTips];
  for (const [cx, cy, cz] of clusters) {
    for (let k = 0; k < 4; k++) {
      canopy.add(
        new IcosahedronGeometry(0.03 + r() * 0.02, 0),
        k % 2 ? 0x3d7f8a : 0x4f9e86,
        [cx + (r() - 0.5) * 0.05, cy + (r() - 0.3) * 0.035, cz + (r() - 0.5) * 0.05],
        [r() * 3, r() * 3, 0],
        1,
        { amount: 0.008, rand: r, colorVar: 0.25 },
      );
    }
  }
  const group = new Group();
  group.add(new Mesh(trunk.build(), flatMaterial()));
  const canopyMat = flatMaterial(0x6fc0a8, 0);
  const canopyMesh = new Mesh(canopy.build(), canopyMat);
  group.add(canopyMesh);
  // socket where the star will rest
  const socket = new Mesh(
    new TorusGeometry(0.018, 0.003, 6, 20),
    new MeshBasicMaterial({ color: 0xc9b98a }),
  );
  socket.rotation.x = Math.PI / 2;
  socket.position.set(0, 0.265, 0);
  group.add(socket);
  return { group, canopyMat, branchTips, socketPos: new Vector3(0, 0.275, 0) };
}

/** Small path lantern; its orb lights when a folk walks past. */
export function pathLantern() {
  const g = new Group();
  const b = new GeoBatch();
  b.add(new CylinderGeometry(0.0012, 0.0016, 0.03, 4), 0x3b3550, [0, 0.015, 0]);
  b.add(new ConeGeometry(0.0055, 0.006, 4), 0x3b3550, [0, 0.036, 0], [0, Math.PI / 4, 0]);
  g.add(new Mesh(b.build(), flatMaterial()));
  const orbMat = new MeshBasicMaterial({ color: 0x3a3f66 });
  const orb = new Mesh(new SphereGeometry(0.0045, 8, 6), orbMat);
  orb.position.y = 0.029;
  g.add(orb);
  const glow = glowSprite(0xffc56a, 0.05, 0);
  glow.position.y = 0.029;
  g.add(glow);
  return { group: g, orbMat, glow };
}

/** One lantern spirit. ~3.5 cm tall with a glowing lantern head. */
export function folkMesh(tint: number) {
  const root = new Group();
  const body = new Group();
  root.add(body);
  const b = new GeoBatch();
  // cloak
  b.add(new ConeGeometry(0.0105, 0.024, 8), 0xf1ecff, [0, 0.012, 0]);
  // hood
  b.add(new SphereGeometry(0.0095, 8, 6), 0xf6f2ff, [0, 0.026, 0], [0, 0, 0], [1, 0.95, 1]);
  // face
  b.add(new SphereGeometry(0.0072, 8, 6), 0x2a2645, [0, 0.0255, 0.004], [0, 0, 0], [1, 0.9, 0.8]);
  // feet
  b.add(new SphereGeometry(0.0035, 6, 4), 0x5c5480, [-0.004, 0.0015, 0.002]);
  b.add(new SphereGeometry(0.0035, 6, 4), 0x5c5480, [0.004, 0.0015, 0.002]);
  const bodyMesh = new Mesh(b.build(), flatMaterial(0x8890ff, 0.12));
  body.add(bodyMesh);
  // eyes (bright so they read from 40 cm)
  const eyeMat = new MeshBasicMaterial({ color: 0xfff6d8 });
  const eyeGeo = new SphereGeometry(0.0016, 6, 4);
  for (const sx of [-0.0028, 0.0028]) {
    const e = new Mesh(eyeGeo, eyeMat);
    e.position.set(sx, 0.0265, 0.0105);
    e.scale.set(1, 1.3, 0.6);
    body.add(e);
  }
  // little lantern held up on a stick
  const stick = new Mesh(new CylinderGeometry(0.0007, 0.0007, 0.022, 4), new MeshBasicMaterial({ color: 0x9a8f7a }));
  stick.position.set(0.009, 0.03, 0.002);
  stick.rotation.z = -0.35;
  body.add(stick);
  const lanternMat = new MeshBasicMaterial({ color: tint });
  const lantern = new Mesh(new OctahedronGeometry(0.0042, 0), lanternMat);
  lantern.position.set(0.0135, 0.041, 0.002);
  body.add(lantern);
  const glow = glowSprite(tint, 0.07, 0.9);
  glow.position.copy(lantern.position);
  body.add(glow);
  return { root, body, lantern, lanternMat, glow, eyeMat };
}

/** Night sky: a sphere of stars plus a soft moon. */
export function sky() {
  const r = rng(99);
  const n = 700;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1;
    const t = r() * Math.PI * 2;
    const y = Math.abs(u) * 0.95 + 0.05;
    const s = Math.sqrt(1 - y * y);
    pos[i * 3] = Math.cos(t) * s * 25;
    pos[i * 3 + 1] = y * 25 - 2;
    pos[i * 3 + 2] = Math.sin(t) * s * 25;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  const stars = new Points(
    g,
    new PointsMaterial({ color: 0xdfe6ff, size: 0.09, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  const group = new Group();
  group.add(stars);
  const moon = new Mesh(new SphereGeometry(0.9, 16, 12), new MeshBasicMaterial({ color: 0xfff3d6 }));
  moon.position.set(-7, 7.5, -16);
  group.add(moon);
  const moonGlow = glowSprite(0xbfc9ff, 7, 0.55);
  moonGlow.position.copy(moon.position);
  group.add(moonGlow);
  // distant floating isles for depth
  const far = new GeoBatch();
  const farR = rng(5);
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.55 + (farR() - 0.5) * 0.3;
    const d = 5 + farR() * 5;
    const size = 0.25 + farR() * 0.5;
    const pos3: [number, number, number] = [Math.cos(a) * d, -1.4 + farR() * 1.2, Math.sin(a) * d];
    far.add(new CylinderGeometry(size, size * 0.95, size * 0.15, 9), 0x3f6f6a, pos3, [0, farR() * 3, 0], 1, { amount: size * 0.08, rand: farR });
    far.add(new ConeGeometry(size * 0.9, size * 1.6, 7), 0x3a3766, [pos3[0], pos3[1] - size * 0.87, pos3[2]], [Math.PI, farR() * 3, 0], 1, { amount: size * 0.2, rand: farR });
  }
  group.add(new Mesh(far.build(), flatMaterial(0x1d2250, 0.9)));
  return { group, starsMat: stars.material as PointsMaterial };
}

/** Rising motes of light used for restoration moments and the finale. */
export class Motes {
  readonly points: Points;
  private vel: Float32Array;
  private life: Float32Array;
  private pos: Float32Array;
  private mat: PointsMaterial;
  private n: number;
  private spawnCursor = 0;

  constructor(n = 160) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.mat = new PointsMaterial({
      color: 0xffd98a,
      size: 0.012,
      map: glowTexture(),
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      sizeAttenuation: true,
    });
    this.points = new Points(g, this.mat);
    this.points.frustumCulled = false;
    for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -100;
  }

  burst(x: number, y: number, z: number, count: number, spread = 0.03, up = 0.06) {
    for (let k = 0; k < count; k++) {
      const i = this.spawnCursor++ % this.n;
      this.pos[i * 3] = x + (Math.random() - 0.5) * spread;
      this.pos[i * 3 + 1] = y + Math.random() * spread * 0.5;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * spread;
      this.vel[i * 3] = (Math.random() - 0.5) * 0.03;
      this.vel[i * 3 + 1] = up * (0.5 + Math.random());
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * 0.03;
      this.life[i] = 1.5 + Math.random() * 2;
    }
  }

  update(dt: number, t: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.pos[i * 3] += (this.vel[i * 3] + Math.sin(t * 2 + i) * 0.006) * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += (this.vel[i * 3 + 2] + Math.cos(t * 1.7 + i) * 0.006) * dt;
      if (this.life[i] <= 0) this.pos[i * 3 + 1] = -100;
    }
    (this.points.geometry.attributes.position as BufferAttribute).needsUpdate = true;
  }
}

/** A glowing leaf that becomes a bridge when set across a gap. */
export function leafMesh() {
  const b = new GeoBatch();
  b.add(new SphereGeometry(0.02, 10, 6), 0x8fd27a, [0, 0, 0], [0, 0, 0], [1.05, 0.12, 2.6]);
  b.add(new CylinderGeometry(0.0009, 0.0009, 0.1, 3), 0xd9f5b0, [0, 0.0025, 0], [Math.PI / 2, 0, 0]);
  const m = new Mesh(b.build(), flatMaterial(0x5fbf6a, 0.35));
  const g = new Group();
  g.add(m);
  const glow = glowSprite(0xb6ff9c, 0.12, 0.35);
  g.add(glow);
  return { group: g, glow };
}

/** The star seed placed into the great tree at the end. */
export function starMesh() {
  const g = new Group();
  const mat = new MeshBasicMaterial({ color: 0xffe9a8 });
  const core = new Mesh(new OctahedronGeometry(0.014, 0), mat);
  core.scale.set(1, 1.35, 1);
  g.add(core);
  const glow = glowSprite(0xffd27a, 0.14, 0.9);
  g.add(glow);
  return { group: g, core, glow };
}
