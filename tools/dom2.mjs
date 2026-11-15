export default async function run({ page, frame }) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addStyleTag({ content: `#workspace-runtime-frame{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;transform:none!important;z-index:2147483646!important}` });
  await new Promise((r) => setTimeout(r, 1000));
  const r = await page.evaluate(() => {
    const f = document.getElementById('workspace-runtime-frame');
    const b = f.getBoundingClientRect();
    const chain = [];
    let e = f;
    while (e && e !== document.body) { const cs = getComputedStyle(e); chain.push(`${e.tagName}#${e.id}.${String(e.className).slice(0,30)} t=${cs.transform} w=${cs.width} h=${cs.height} pos=${cs.position} ov=${cs.overflow}`); e = e.parentElement; }
    return { rect: [b.x, b.y, b.width, b.height], inner: [innerWidth, innerHeight], chain };
  });
  const fr = await frame.evaluate(() => [innerWidth, innerHeight, ...[...document.querySelectorAll('canvas')].map(c=>c.width+'x'+c.height)]);
  console.log(JSON.stringify({ ...r, fr }));
}
