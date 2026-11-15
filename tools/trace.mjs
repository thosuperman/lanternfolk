export default async function run({ frame, page }) {
  const t = frame ?? page;
  const out = [];
  for (let i = 0; i < 70; i++) {
    out.push(await t.evaluate(() => { const F = __lf.zones[0].folk[0]; const h = __lf.hands.hands[1]; return `${F.state}:s=${F.s.toFixed(3)}:blk=${F.step.blocked}:hand=${h.present}:hy=${h.joints[34].toFixed(2)}:sy=${F.step.y.toFixed(3)}:fx=${F.pos.x.toFixed(2)}`; }));
    await new Promise((r) => setTimeout(r, 100));
  }
  console.log(JSON.stringify(out));
}
