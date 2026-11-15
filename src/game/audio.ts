/**
 * Tiny procedural sound engine (Web Audio). Every sound is synthesised at
 * runtime, so the project ships no third-party audio files.
 */

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const BASE_HZ = 392; // G4

export class Sound {
  private ctx: AudioContext | null = null;
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
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.8;
        this.master.connect(this.ctx.destination);
        this.reverb = this.ctx.createConvolver();
        this.reverb.buffer = this.impulse(2.6);
        this.wet = this.ctx.createGain();
        this.wet.gain.value = 0.35;
        this.reverb.connect(this.wet).connect(this.master);
      }
      if (this.ctx.state !== 'running') void this.ctx.resume();
    } catch {
      this.ctx = null; // audio is optional; never block gameplay
    }
  }

  setPaused(paused: boolean) {
    if (!this.ctx) return;
    if (paused) void this.ctx.suspend();
    else void this.ctx.resume();
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
    const osc = ctx.createOscillator();
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
    const t = this.ctx.currentTime + delay;
    const f = this.note(step);
    this.voice(f, t, 1.6, gain, 'sine', pan);
    this.voice(f * 2.01, t, 0.7, gain * 0.25, 'sine', pan);
  }

  /** Tiny footstep on the player's hand: rising pentatonic plinks. */
  step(pan = 0) {
    if (!this.ctx) return;
    const s = this.stepIndex++ % 6;
    const t = this.ctx.currentTime;
    this.voice(this.note(s + 3), t, 0.35, 0.07, 'triangle', pan);
  }

  resetSteps() {
    this.stepIndex = 0;
  }

  wake(pan = 0) {
    [0, 2, 4].forEach((s, i) => this.bell(s, i * 0.09, 0.14, pan));
  }

  call(pan = 0) {
    this.bell(5, 0, 0.06, pan);
    this.bell(4, 0.14, 0.05, pan);
  }

  hop(pan = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
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

  pickup() {
    this.bell(7, 0, 0.1);
  }

  place() {
    [4, 7, 9].forEach((s, i) => this.bell(s, i * 0.07, 0.12));
  }

  arrive() {
    [0, 4, 7, 9, 12].forEach((s, i) => this.bell(s, i * 0.11, 0.13));
  }

  bloom() {
    [0, 2, 4, 7, 9, 12, 14, 16].forEach((s, i) =>
      this.bell(s, i * 0.12, 0.12, Math.sin(i) * 0.6),
    );
  }

  finale() {
    const seq = [0, 4, 7, 12, 9, 14, 16, 19, 21, 24];
    seq.forEach((s, i) => this.bell(s % 11, i * 0.16, 0.13, Math.sin(i * 1.3) * 0.7));
    seq.forEach((s, i) => this.bell((s + 2) % 11, 1.8 + i * 0.2, 0.08, Math.cos(i) * 0.7));
  }

  /** Night-time pad: two detuned oscillators through a slow filter. */
  startAmbience() {
    const ctx = this.ctx;
    if (!ctx || this.ambience) return;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, ctx.currentTime);
    out.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 4);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.05;
    lfoGain.gain.value = 300;
    lfo.connect(lfoGain).connect(filter.frequency);
    const oscs = [98, 146.8, 196.5, 293.7].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      o.detune.value = (i - 1.5) * 6;
      o.connect(filter);
      o.start();
      return o;
    });
    filter.connect(out);
    out.connect(this.master);
    out.connect(this.reverb);
    lfo.start();
    this.ambience = {
      stop: () => {
        const t = ctx.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(out.gain.value, t);
        out.gain.linearRampToValueAtTime(0, t + 1.5);
        oscs.forEach((o) => o.stop(t + 1.6));
        lfo.stop(t + 1.6);
      },
    };
  }

  stopAmbience() {
    this.ambience?.stop();
    this.ambience = null;
  }
}

export const sound = new Sound();
