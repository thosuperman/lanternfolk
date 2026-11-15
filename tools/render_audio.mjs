// Dev helper: re-render a filmed take's soundtrack with the game's own audio code.
// Reads REC_DIR/events.json (cue log with performance.now() timestamps) and
// REC_DIR/frames.json (screencast wall-clock timestamps), renders the cues through
// Sound.renderOffline() in the app page, and writes REC_DIR/game_audio.wav.
import fs from 'node:fs';
import path from 'node:path';

export default async function run({ page }) {
  const dir = process.env.REC_DIR;
  const { events, clock } = JSON.parse(fs.readFileSync(path.join(dir, 'events.json'), 'utf8'));
  const frames = JSON.parse(fs.readFileSync(path.join(dir, 'frames.json'), 'utf8'));
  const startWallMs = frames[0].t * 1000;
  const seconds = frames[frames.length - 1].t - frames[0].t + 0.5;
  // performance.now() of the first frame, in the page's clock.
  const t0 = clock.perf - (clock.wall - startWallMs);
  const app = page.frames().find((f) => f !== page.mainFrame()) ?? page;
  const b64 = await app.evaluate(
    async ({ events, t0, seconds }) => {
      const mod = await import('/src/game/audio.ts');
      const buf = await mod.Sound.renderOffline(events, t0, seconds, 48000);
      // Encode 16-bit PCM WAV.
      const ch = buf.numberOfChannels;
      const n = buf.length;
      const out = new DataView(new ArrayBuffer(44 + n * ch * 2));
      const w = (o, s) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
      w(0, 'RIFF');
      out.setUint32(4, 36 + n * ch * 2, true);
      w(8, 'WAVEfmt ');
      out.setUint32(16, 16, true);
      out.setUint16(20, 1, true);
      out.setUint16(22, ch, true);
      out.setUint32(24, 48000, true);
      out.setUint32(28, 48000 * ch * 2, true);
      out.setUint16(32, ch * 2, true);
      out.setUint16(34, 16, true);
      w(36, 'data');
      out.setUint32(40, n * ch * 2, true);
      const data = [...Array(ch)].map((_, c) => buf.getChannelData(c));
      let o = 44;
      for (let i = 0; i < n; i++) {
        for (let c = 0; c < ch; c++) {
          const v = Math.max(-1, Math.min(1, data[c][i]));
          out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
          o += 2;
        }
      }
      const bytes = new Uint8Array(out.buffer);
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    },
    { events, t0, seconds },
  );
  fs.writeFileSync(path.join(dir, 'game_audio.wav'), Buffer.from(b64, 'base64'));
  console.log(JSON.stringify({ events: events.length, seconds }));
}
