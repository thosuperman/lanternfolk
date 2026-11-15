// Dev helper: record the managed emulator page via CDP screencast.
// Env: REC_DIR (output folder), REC_SECONDS (duration), REC_W/REC_H (viewport).
// Frames are saved as JPEGs with their timestamps in frames.json; tools/encode.py
// turns them into a constant-frame-rate MP4. This captures the real running app.
import fs from 'node:fs';
import path from 'node:path';

export default async function run({ page, cdp }) {
  const dir = process.env.REC_DIR;
  const seconds = Number(process.env.REC_SECONDS || 30);
  const W = Number(process.env.REC_W || 1920);
  const H = Number(process.env.REC_H || 1080);
  fs.mkdirSync(dir, { recursive: true });
  await page.setViewportSize({ width: W, height: H });
  // Hide emulator chrome (dev-only overlays) so the footage shows the app only.
  await page.addStyleTag({
    content: `#landing{display:none!important}
      [class*="remote"],[id*="remote"],[class*="iwer"],[id*="iwer"],[class*="devui"],[id*="devui"]{display:none!important}`,
  }).catch(() => {});
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('body *')) {
      const t = (el.textContent || '').trim();
      if ((t === 'Remote Control Active' || t === 'Enter XR') && el.children.length <= 3) {
        const host = el.closest('button,div') || el;
        host.style.display = 'none';
      }
    }
  });
  // Stretch the app iframe over the dev shell so the capture is full-frame.
  await page.addStyleTag({
    content: `#workspace-runtime-frame{position:fixed!important;left:0!important;top:0!important;right:auto!important;bottom:auto!important;
      width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;
      transform:none!important;z-index:2147483646!important;border:0!important;border-radius:0!important;box-shadow:none!important}`,
  });
  await new Promise((r) => setTimeout(r, 800));
  // Signal the orchestrator that the viewport is ready, then wait for it to
  // (re)enter XR so the XR framebuffer is created at full size.
  const flag = (name) => path.join(dir, name);
  fs.writeFileSync(flag('VIEWPORT_READY'), '1');
  for (let i = 0; i < 3000 && !fs.existsSync(flag("GO")); i++) await new Promise((r) => setTimeout(r, 100));
  const session = cdp ?? (await page.context().newCDPSession(page));
  const frames = [];
  let n = 0;
  session.on('Page.screencastFrame', async (e) => {
    const file = path.join(dir, `f${String(n).padStart(6, '0')}.jpg`);
    n++;
    fs.writeFileSync(file, Buffer.from(e.data, 'base64'));
    frames.push({ file, t: e.metadata.timestamp });
    await session.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {});
  });
  await session.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  const t0 = Date.now();
  while (Date.now() - t0 < seconds * 1000 && !fs.existsSync(flag('STOP'))) await new Promise((r) => setTimeout(r, 100));
  await session.send('Page.stopScreencast');
  // Game event log (for re-rendering the game's own synthesized audio in sync).
  const target = (await page.frames()).find((f) => f !== page.mainFrame()) ?? page;
  const events = await target.evaluate(() => window.__lfEvents ?? []).catch(() => []);
  const clock = await target.evaluate(() => ({ perf: performance.now(), wall: Date.now() })).catch(() => null);
  fs.writeFileSync(path.join(dir, 'events.json'), JSON.stringify({ events, clock }));
  fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify(frames));
  console.log(JSON.stringify({ frames: frames.length, seconds }));
  return { frames: frames.length };
}
