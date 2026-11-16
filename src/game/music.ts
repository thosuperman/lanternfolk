/**
 * "Moonlit Grove" — an original generative score, synthesised live with Web Audio.
 *
 * 66 BPM, no percussion. Layers fade in as the grove warms up:
 *   warmth 0  pad + wind + a sparse, mysterious music box
 *   warmth 1  + soft piano bass and chord tones
 *   warmth 2  + glass bells, firefly sparkles
 *   warmth 3  + warmer pad filter, a lower counter-melody
 *   finale    a short rising resolution, then back to the calm loop
 *
 * Everything is scheduled from a seeded random generator through
 * scheduleUntil(), so the same code can run live (with a look-ahead timer)
 * or offline (OfflineAudioContext) to render the trailer soundtrack in sync.
 */

const BPM = 66;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
/** G major: Gmaj9 – Em7 – Cmaj9 – Dsus2, two bars each. */
const CHORDS: number[][] = [
  [43, 50, 54, 57, 62], // G2 D3 F#3 A3 D4
  [40, 47, 50, 55, 59], // E2 B2 D3 G3 B3
  [36, 43, 47, 50, 55], // C2 G2 B2 D3 G3
  [38, 45, 50, 52, 57], // D2 A2 D3 E3 A3
];
/** Mysterious progression (level 3): Em9 – Cmaj7 – Am9 – Dsus4, low and open. */
const CHORDS_MYST: number[][] = [
  [40, 47, 54, 55, 62],
  [36, 43, 50, 52, 59],
  [33, 45, 52, 55, 59],
  [38, 45, 50, 55, 57],
];
export type MusicMood = 'calm' | 'playful' | 'mysterious';
/** Melody notes (MIDI) that sit well over every chord: G major pentatonic. */
const MELODY = [74, 76, 79, 81, 83, 86, 88, 91];
/** A composed 8-step motif (indices into MELODY, -1 = rest) varied over time. */
const MOTIF = [2, -1, 4, 3, -1, 2, 1, -1];

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1000000) / 1000000;
  };
}

export class Music {
  private ctx: BaseAudioContext;
  private out: GainNode;
  private musicBus: GainNode;
  private ambBus: GainNode;
  private padFilter: BiquadFilterNode;
  private reverb: ConvolverNode;
  private nextBeat = 0;
  private beatIndex = 0;
  private rand = rng(20261118);
  private warmth = 0;
  /** Finale: requested, then starts at the next bar line (beat index). */
  private finalePending = false;
  private finaleStart = -1;
  /** Mood mix (crossfaded per beat) and tension 0..1. */
  private w = { calm: 1, playful: 0, mysterious: 0 };
  private wTarget = { calm: 1, playful: 0, mysterious: 0 };
  private tension = 0;
  private tensionTarget = 0;
  private started = false;
  private startTime = 0;
  private windGain: GainNode | null = null;
  private nextRustle = 0;
  private nextSparkle = 0;

  constructor(ctx: BaseAudioContext, destination: AudioNode, reverb: ConvolverNode) {
    this.ctx = ctx;
    this.reverb = reverb;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(destination);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.55;
    this.musicBus.connect(this.out);
    this.musicBus.connect(reverb);
    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = 0.5;
    this.ambBus.connect(this.out);
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 650;
    this.padFilter.Q.value = 0.4;
    this.padFilter.connect(this.musicBus);
  }

  /** Begin the score at context time `t` with a slow fade-in. */
  start(t: number) {
    if (this.started) return;
    this.started = true;
    this.startTime = t;
    this.nextBeat = t + 0.2;
    this.beatIndex = 0;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(0, t);
    this.out.gain.linearRampToValueAtTime(1, t + 5);
    this.startWind(t);
    this.nextRustle = t + 4;
    this.nextSparkle = t + 6;
  }

  stop(t: number) {
    if (!this.started) return;
    this.started = false;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setValueAtTime(this.out.gain.value, t);
    this.out.gain.linearRampToValueAtTime(0, t + 2);
  }

  setMuted(muted: boolean, t: number) {
    this.musicBus.gain.cancelScheduledValues(t);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
    this.musicBus.gain.linearRampToValueAtTime(muted ? 0 : 0.55, t + 0.8);
  }

  /** 0..3; each rescued spirit warms the music a little. */
  setWarmth(w: number, t: number) {
    this.warmth = Math.max(0, Math.min(3, w));
    const f = 650 + this.warmth * 380;
    this.padFilter.frequency.cancelScheduledValues(t);
    this.padFilter.frequency.setValueAtTime(this.padFilter.frequency.value, t);
    this.padFilter.frequency.linearRampToValueAtTime(f, t + 6);
  }

  /** Play the resolution at the next bar line. */
  finale(t: number) {
    void t;
    this.finalePending = true;
  }

  /** Crossfade to a mood over the next few beats. */
  setMood(m: MusicMood) {
    this.wTarget = { calm: m === 'calm' ? 1 : 0, playful: m === 'playful' ? 1 : 0, mysterious: m === 'mysterious' ? 1 : 0 };
    this.finaleStart = -1;
  }

  /** 0..1: gentle suspense layered on top of the current mood. */
  setTension(x: number) {
    this.tensionTarget = Math.max(0, Math.min(1, x));
  }

  /** Beat length follows the mood: calm 66, playful 82, mysterious 62 BPM; tension adds a little drive. */
  private beatLen() {
    const w = this.w;
    const bpm = (66 * w.calm + 82 * w.playful + 62 * w.mysterious) / (w.calm + w.playful + w.mysterious || 1) + 12 * this.tension;
    return 60 / bpm;
  }

  /** Schedule all notes that start before context time `until`. */
  scheduleUntil(until: number) {
    if (!this.started) return;
    while (this.nextBeat < until) {
      // Ease the mood mix and tension toward their targets once per beat (smooth crossfades).
      for (const k of ['calm', 'playful', 'mysterious'] as const) this.w[k] += (this.wTarget[k] - this.w[k]) * 0.3;
      this.tension += (this.tensionTarget - this.tension) * 0.35;
      const beat = this.beatLen();
      this.scheduleBeat(this.nextBeat, this.beatIndex, beat);
      this.nextBeat += beat;
      this.beatIndex++;
    }
    while (this.nextRustle < until) {
      this.rustle(this.nextRustle);
      this.nextRustle += 3.5 + this.rand() * 5;
    }
    while (this.nextSparkle < until) {
      if (this.warmth >= 2) this.sparkle(this.nextSparkle);
      this.nextSparkle += 1.6 + this.rand() * 3.5;
    }
  }

  /* -------------------------------------------------------------- notes -- */

  private scheduleBeat(t: number, i: number, beat: number) {
    const barIdx = Math.floor(i / 4);
    const beatInBar = i % 4;
    const bar = beat * 4;
    const myst = this.w.mysterious;
    const chordSet = myst > 0.5 ? CHORDS_MYST : CHORDS;
    const chord = chordSet[Math.floor(barIdx / 2) % chordSet.length];
    if (this.finalePending && beatInBar === 0) {
      this.finalePending = false;
      this.finaleStart = i;
    }
    if (this.finaleStart >= 0 && i - this.finaleStart < 24) {
      this.scheduleFinaleBeat(t, i - this.finaleStart, beat);
      return;
    }
    // Pad: one long swell per chord (every two bars).
    if (beatInBar === 0 && barIdx % 2 === 0) {
      for (const n of chord.slice(1)) this.pad(midi(n), t, bar * 2.3, 0.05);
    }
    this.playfulLayer(t, i, beat, chord);
    this.tensionLayer(t, i, beat, chord);
    // Piano: bass + a gentle broken chord.
    if (this.warmth >= 1) {
      if (beatInBar === 0) this.piano(midi(chord[0] + 12), t, 2.8, 0.11);
      if (beatInBar === 2 && this.rand() < 0.7) this.piano(midi(chord[2 + Math.floor(this.rand() * 3)] + 12), t + 0.02, 2.2, 0.06);
    }
    // Music box: the motif, sparse at first, fuller as the grove warms.
    const step = i % MOTIF.length;
    const density = [0.35, 0.55, 0.7, 0.85][this.warmth];
    const varied = barIdx % 4 === 3;
    let idx = MOTIF[step];
    if (varied && idx >= 0) idx = Math.min(MELODY.length - 1, idx + (this.rand() < 0.5 ? 1 : 2));
    if (idx >= 0 && this.rand() < density) {
      this.musicBox(midi(MELODY[idx]), t, 0.07);
      if (this.rand() < 0.25 * this.warmth) this.musicBox(midi(MELODY[idx]), t + beat / 2, 0.04);
    }
    // Counter-melody an octave down once the grove is warm.
    if (this.warmth >= 3 && beatInBar === 1 && this.rand() < 0.6) {
      this.musicBox(midi(MELODY[Math.floor(this.rand() * 5)] - 12), t, 0.05);
    }
    // Glass bells, rare and soft.
    if (this.warmth >= 2 && beatInBar === 3 && barIdx % 2 === 1 && this.rand() < 0.5) {
      this.bell(midi(MELODY[3 + Math.floor(this.rand() * 4)] + 12), t, 0.035);
    }
  }

  /** Playful mood: marimba eighths, pizzicato bass, a soft shaker and kick. */
  private playfulLayer(t: number, i: number, beat: number, chord: number[]) {
    const g = this.w.playful;
    if (g < 0.05) return;
    const b = i % 4;
    if (b === 0 || b === 2) this.pluck(midi(chord[0] + 12), t, 0.09 * g);
    if (b === 0) this.kick(t, 0.09 * g);
    this.shaker(t + beat / 2, 0.03 * g);
    // marimba: a bouncy pattern drawn from the chord and the melody scale
    const pattern = [0, 2, 1, 3, 2, 4, 3, 1];
    for (let s = 0; s < 2; s++) {
      const k = pattern[(i * 2 + s) % pattern.length];
      if (this.rand() < 0.75) this.marimba(midi(MELODY[k] - 12), t + s * (beat / 2), 0.06 * g);
    }
  }

  /** Suspense: low pulses, a rising figure, a soft string swell. Magical, not scary. */
  private tensionLayer(t: number, i: number, beat: number, chord: number[]) {
    const g = this.tension;
    if (g < 0.08) return;
    const b = i % 4;
    for (let s = 0; s < 2; s++) this.pulse(midi(chord[0]), t + s * (beat / 2), 0.07 * g);
    if (b === 0 && (Math.floor(i / 4) % 2) === 1) {
      [0, 1, 2, 3].forEach((k) => this.musicBox(midi(MELODY[2 + k]), t + k * (beat / 4), 0.04 * g));
    }
    if (b === 0) this.strings(midi(chord[2] + 12), t, beat * 4.2, 0.03 * g);
  }

  private scheduleFinaleBeat(t: number, k: number, beat: number) {
    const BEAT = beat;
    const BAR = beat * 4;
    // 6 bars: rising arpeggio over G, a lift to C, then rest on Gmaj9.
    const plan: number[][] = [
      [43, 55, 62, 67, 71, 74],
      [43, 55, 62, 67, 71, 74],
      [36, 52, 60, 64, 67, 72],
      [38, 54, 62, 66, 69, 74],
      [43, 54, 57, 62, 66, 69, 74, 79],
      [43, 54, 57, 62, 66, 69, 74, 79],
    ];
    const bar = Math.min(plan.length - 1, Math.floor(k / 4));
    const notes = plan[bar];
    const b = k % 4;
    if (b === 0) {
      for (const n of notes.slice(1, 5)) this.pad(midi(n), t, BAR * 1.4, 0.055);
      this.piano(midi(notes[0] + 12), t, 3.4, 0.13);
    }
    const arp = notes.slice(2);
    for (let s = 0; s < 2; s++) {
      const n = arp[(b * 2 + s) % arp.length] + (bar >= 4 ? 12 : 0);
      this.musicBox(midi(n), t + s * (BEAT / 2), 0.075);
    }
    if (bar >= 4 && b === 0) this.bell(midi(91), t + BEAT, 0.05);
  }

  /* ------------------------------------------------------------- voices -- */

  private env(t: number, attack: number, dur: number, peak: number) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  private pad(f: number, t: number, dur: number, peak: number) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(peak * 0.8, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    for (const [type, detune] of [['sine', -5], ['triangle', 6]] as const) {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = detune;
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.1);
    }
    g.connect(this.padFilter);
  }

  private piano(f: number, t: number, dur: number, peak: number) {
    const g = this.env(t, 0.008, dur, peak);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2600, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + dur * 0.6);
    for (const [mult, amp] of [[1, 1], [2, 0.35], [3, 0.12]] as const) {
      const o = this.ctx.createOscillator();
      const a = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f * mult;
      a.gain.value = amp;
      o.connect(a).connect(lp);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    lp.connect(g).connect(this.musicBus);
  }

  private musicBox(f: number, t: number, peak: number) {
    const g = this.env(t, 0.004, 1.4, peak);
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const o2 = this.ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 4.02; // metallic tine partial
    const g2 = this.env(t, 0.002, 0.25, peak * 0.3);
    o.connect(g).connect(this.musicBus);
    o2.connect(g2).connect(this.musicBus);
    o.start(t);
    o2.start(t);
    o.stop(t + 1.5);
    o2.stop(t + 0.3);
  }

  private pluck(f: number, t: number, peak: number) {
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const g = this.env(t, 0.003, 0.35, peak);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.4);
  }

  private marimba(f: number, t: number, peak: number) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const o2 = this.ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = f * 3.93;
    const g = this.env(t, 0.002, 0.45, peak);
    const g2 = this.env(t, 0.001, 0.08, peak * 0.4);
    o.connect(g).connect(this.musicBus);
    o2.connect(g2).connect(this.musicBus);
    o.start(t);
    o2.start(t);
    o.stop(t + 0.5);
    o2.stop(t + 0.12);
  }

  private kick(t: number, peak: number) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    const g = this.env(t, 0.003, 0.25, peak);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.3);
  }

  private shakerBuf: AudioBuffer | null = null;
  private shaker(t: number, peak: number) {
    if (!this.shakerBuf) this.shakerBuf = this.noiseBuffer(0.2);
    const src = this.ctx.createBufferSource();
    src.buffer = this.shakerBuf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    const g = this.env(t, 0.004, 0.09, peak * 6);
    src.connect(hp).connect(g).connect(this.musicBus);
    src.start(t);
    src.stop(t + 0.12);
  }

  private pulse(f: number, t: number, peak: number) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = this.env(t, 0.01, 0.28, peak);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.32);
  }

  private strings(f: number, t: number, dur: number, peak: number) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + dur * 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    for (const det of [-7, 7]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
    lp.connect(g).connect(this.musicBus);
  }

  private bell(f: number, t: number, peak: number) {
    for (const [mult, amp, dur] of [[1, 1, 3.5], [2.76, 0.45, 2], [5.4, 0.2, 1.1]] as const) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mult;
      const g = this.env(t, 0.003, dur, peak * amp);
      o.connect(g).connect(this.musicBus);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  /* ----------------------------------------------------------- ambience -- */

  private noiseBuffer(seconds: number) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    const r = rng(7);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // brown-ish noise: softer than white
      last = (last + 0.02 * (r() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    return buf;
  }

  private startWind(t: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(6);
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 0.6;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoAmt = this.ctx.createGain();
    lfoAmt.gain.value = 220;
    lfo.connect(lfoAmt).connect(bp.frequency);
    const g = this.ctx.createGain();
    g.gain.value = 0.32;
    const gl = this.ctx.createOscillator();
    gl.frequency.value = 0.045;
    const glAmt = this.ctx.createGain();
    glAmt.gain.value = 0.14;
    gl.connect(glAmt).connect(g.gain);
    src.connect(bp).connect(g).connect(this.ambBus);
    src.start(t);
    lfo.start(t);
    gl.start(t);
    this.windGain = g;
  }

  /** Leaves rustling: a short band-passed noise swell. */
  private rustle(t: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(1.2);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 2400 + this.rand() * 1800;
    hp.Q.value = 0.9;
    const g = this.ctx.createGain();
    const peak = 0.05 + this.rand() * 0.05;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.35);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.15);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = this.rand() * 1.6 - 0.8;
    src.connect(hp).connect(g).connect(pan).connect(this.ambBus);
    src.start(t);
    src.stop(t + 1.2);
  }

  /** A firefly: two tiny high pings. */
  private sparkle(t: number) {
    const f = 2400 + this.rand() * 1600;
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = this.rand() * 1.8 - 0.9;
    pan.connect(this.ambBus);
    pan.connect(this.reverb);
    for (let k = 0; k < 2; k++) {
      const o = this.ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * (k ? 1.5 : 1);
      const g = this.env(t + k * 0.07, 0.002, 0.35, 0.025);
      o.connect(g).connect(pan);
      o.start(t + k * 0.07);
      o.stop(t + k * 0.07 + 0.4);
    }
  }

  get isStarted() {
    return this.started;
  }

  get wind() {
    return this.windGain;
  }
}

