export default async function run({ page, frame }) {
  const info = async (t) => t.evaluate(() => ({
    url: location.href.slice(0, 80),
    iframes: [...document.querySelectorAll('iframe')].map((f) => ({ id: f.id, cls: f.className, w: f.clientWidth, h: f.clientHeight, src: (f.src||'').slice(0,60) })),
    canvases: [...document.querySelectorAll('canvas')].map((c) => ({ id: c.id, cls: c.className, w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight, parent: c.parentElement?.tagName + '.' + c.parentElement?.className })),
    inner: [innerWidth, innerHeight],
  }));
  const r = { page: await info(page), frame: frame && frame !== page ? await info(frame) : null, frames: page.frames().length };
  console.log(JSON.stringify(r));
  return r;
}
