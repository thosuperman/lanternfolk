/**
 * Tiny procedural sound engine (Web Audio). Every sound is synthesised at
 * runtime, so the project ships no third-party audio files.
 */

import { Music } from './music.js';

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const BASE_HZ = 392; // G4

export class Sound {
  private ctx: BaseAudioContext | null = null;
  /** Seconds added to currentTime; used when re-rendering offline. */
  offset = 0;
  private now() {
    return this.ctx!.currentTime + this.offset;
  }

  /** Every cue is logged with a timestamp so trailers can re-render the exact soundtrack. */
  logging = true;
  private log(name: string, ...args: number[]) {
    if (!this.logging) return;
    const w = window as unknown as { __lfEvents?: { n: string; a: number[]; t: number }[] };
    const list = (w.__lfEvents ??= []);
    if (list.length < 5000) list.push({ n: name, a: args, t: performance.now() });
  }

  /** Attach to an existing (e.g. Offline) context instead of creating one. */
  attach(ctx: BaseAudioContext) {
    this.ctx = ctx;
    // master -> gentle limiter -> speakers, so stacked cues never get harsh.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 10;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.25;
    limiter.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(limiter);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.6);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.35;
    this.reverb.connect(this.wet).connect(this.master);
    this.music = new Music(ctx, this.master, this.reverb);
  }
  music: Music | null = null;
  private timer: number | null = null;
  private voices = 0;
  private master!: GainNode;
  private reverb!: ConvolverNode;
  private wet!: GainNode;
  private ambience: { stop: () => void } | null = null;
  private stepIndex = 0;
  muted = false;

  /** Must be called from a user gesture (e.g. the Enter VR click). */
  unlock() {
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        this.attach(new Ctor());
      }
      if (this.ctx!.state !== 'running') void (this.ctx as AudioContext).resume();
    } catch {
      this.ctx = null; // audio is optional; never block gameplay
    }
  }

  setPaused(paused: boolean) {
    if (!this.ctx) return;
    const c = this.ctx as AudioContext;
    if (!c.suspend) return;
    if (paused) void c.suspend();
    else void c.resume();
  }

  private impulse(seconds: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
    }
    return buf;
  }

  private voice(
    freq: number,
    start: number,
    dur: number,
    gain: number,
    type: OscillatorType = 'sine',
    pan = 0,
  ) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    if (this.voices > 28) return; // never let stacked cues pile up
    this.voices++;
    const osc = ctx.createOscillator();
    osc.onended = () => this.voices--;
    const env = ctx.createGain();
    const panner = ctx.createStereoPanner();
    osc.type = type;
    osc.frequency.value = freq;
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(gain, start + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(env).connect(panner);
    panner.connect(this.master);
    panner.connect(this.reverb);
    osc.start(start);
    osc.stop(start + dur + 0.05);
  }

  private note(step: number, octave = 0) {
    return BASE_HZ * Math.pow(2, (PENTA[step % PENTA.length] + 12 * octave) / 12);
  }

  /** Soft bell (sine + quiet octave partial). */
  bell(step: number, delay = 0, gain = 0.18, pan = 0) {
    if (!this.ctx) return;
    const t = this.now() + delay;
    const f = this.note(step);
    this.voice(f, t, 1.6, gain, 'sine', pan);
    this.voice(f * 2.01, t, 0.7, gain * 0.25, 'sine', pan);
  }

  /** Tiny footstep on the player's hand: rising pentatonic plinks. */
  step(pan = 0) {
    this.log('step', pan);
    if (!this.ctx) return;
    const s = this.stepIndex++ % 6;
    const t = this.now();
    this.voice(this.note(s + 3), t, 0.35, 0.07, 'triangle', pan);
  }

  resetSteps() {
    this.stepIndex = 0;
  }

  wake(pan = 0) {
    this.log('wake', pan);
    [0, 2, 4].forEach((s, i) => this.bell(s, i * 0.09, 0.14, pan));
  }

  call(pan = 0) {
    this.log('call', pan);
    this.bell(5, 0, 0.06, pan);
    this.bell(4, 0.14, 0.05, pan);
  }

  hop(pan = 0) {
    this.log('hop', pan);
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = this.now();
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, t);
    osc.frequency.exponentialRampToValueAtTime(1100, t + 0.12);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.07, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    osc.connect(env).connect(p).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  /** A tiny happy "coo" from a spirit: two quick rising notes with a vibrato. */
  cheer(pan = 0) {
    this.log('cheer', pan);
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = this.now();
    for (let k = 0; k < 2; k++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const vib = ctx.createOscillator();
      const vg = ctx.createGain();
      o.type = 'sine';
      const f0 = 880 + Math.random() * 120;
      o.frequency.setValueAtTime(f0 * (k ? 1.26 : 1), t + k * 0.11);
      o.frequency.exponentialRampToValueAtTime(f0 * (k ? 1.5 : 1.2), t + k * 0.11 + 0.09);
      vib.frequency.value = 18;
      vg.gain.value = 14;
      vib.connect(vg).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t + k * 0.11);
      g.gain.linearRampToValueAtTime(0.045, t + k * 0.11 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + k * 0.11 + 0.16);
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      o.connect(g).connect(p).connect(this.master);
      p.connect(this.reverb);
      o.start(t + k * 0.11);
      vib.start(t + k * 0.11);
      o.stop(t + k * 0.11 + 0.2);
      vib.stop(t + k * 0.11 + 0.2);
    }
  }

  pickup() {
    this.log('pickup');
    this.bell(7, 0, 0.1);
  }

  place() {
    this.log('place');
    [4, 7, 9].forEach((s, i) => this.bell(s, i * 0.07, 0.12));
  }

  arrive() {
    this.log('arrive');
    [0, 4, 7, 9, 12].forEach((s, i) => this.bell(s, i * 0.11, 0.13));
  }

  bloom() {
    this.log('bloom');
    [0, 2, 4, 7, 9, 12, 14, 16].forEach((s, i) =>
      this.bell(s, i * 0.12, 0.12, Math.sin(i) * 0.6),
    );
  }

  finale() {
    this.log('finale');
    const seq = [0, 4, 7, 12, 9, 14, 16, 19, 21, 24];
    seq.forEach((s, i) => this.bell(s % 11, i * 0.16, 0.13, Math.sin(i * 1.3) * 0.7));
    seq.forEach((s, i) => this.bell((s + 2) % 11, 1.8 + i * 0.2, 0.08, Math.cos(i) * 0.7));
  }

  /** Start the generative score (fades in) and its look-ahead scheduler. */
  startAmbience() {
    this.log('startAmbience');
    if (!this.ctx || !this.music) return;
    this.music.start(this.now());
    if (this.timer === null && typeof window !== 'undefined' && this.ctx instanceof AudioContext) {
      this.timer = window.setInterval(() => this.music?.scheduleUntil(this.now() + 0.8), 200);
    }
    this.music.scheduleUntil(this.now() + 0.8);
  }

  stopAmbience() {
    this.log('stopAmbience');
    if (!this.ctx || !this.music) return;
    this.music.stop(this.now());
  }

  /** Each rescued spirit warms the music by one layer. */
  setWarmth(w: number) {
    this.log('warmth', w);
    this.music?.setWarmth(w, this.now());
  }

  musicFinale() {
    this.log('musicFinale');
    this.music?.finale(this.now());
  }

  /** Hands-first mute toggle (music only; interaction cues stay audible). */
  setMusicMuted(m: boolean) {
    this.log('musicMuted', m ? 1 : 0);
    this.musicMuted = m;
    this.music?.setMuted(m, this.now());
  }
  musicMuted = false;

  /** Offline renderer for trailers: replays logged cues into an OfflineAudioContext. */
  static async renderOffline(
    events: { n: string; a: number[]; t: number }[],
    t0: number,
    seconds: number,
    sampleRate = 48000,
  ): Promise<AudioBuffer> {
    const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
    const s = new Sound();
    s.logging = false;
    s.attach(ctx);
    // State cues (music start/stop, warmth, mute) from before the clip still apply;
    // one-shot sound effects from before the clip are dropped.
    const state = new Set(['startAmbience', 'stopAmbience', 'warmth', 'musicMuted', 'musicFinale']);
    const sorted = events.filter((e) => state.has(e.n) || e.t >= t0 - 300).sort((a, b) => a.t - b.t);
    for (const e of sorted) {
      const at = Math.max(0, (e.t - t0) / 1000);
      if (at > seconds) break;
      s.music?.scheduleUntil(at);
      s.offset = at;
      const fn = (s as unknown as Record<string, (...x: number[]) => void>)[e.n];
      if (e.n === 'musicMuted') s.setMusicMuted(!!e.a[0]);
      else if (typeof fn === 'function') fn.apply(s, e.a);
    }
    s.offset = 0;
    s.music?.scheduleUntil(seconds);
    return ctx.startRendering();
  }
}

export const sound = new Sound();
