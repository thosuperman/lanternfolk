export default async function run({ page }) {
  const res = [];
  for (const f of page.frames()) {
    res.push(await f.evaluate(() => {
      const found = [];
      const walk = (root, depth) => {
        for (const el of root.querySelectorAll('*')) {
          if (el.shadowRoot) { found.push('shadow:' + el.tagName + '#' + el.id); walk(el.shadowRoot, depth + 1); }
          if ((el.textContent || '').trim() === 'Remote Control Active' && el.children.length === 0) found.push('pill:' + el.tagName + ' depth' + depth + ' parent=' + el.parentElement?.tagName + '.' + el.parentElement?.className);
        }
      };
      walk(document, 0);
      const cs = [...document.querySelectorAll('canvas')].map((c) => `${c.width}x${c.height} css=${c.style.cssText.slice(0,80)} parent=${c.parentElement?.tagName}#${c.parentElement?.id}.${c.parentElement?.className} pstyle=${c.parentElement?.style.cssText.slice(0,120)}`);
      return { url: location.href.slice(0, 50), found: found.slice(0, 12), cs };
    }).catch((e) => String(e)));
  }
  console.log(JSON.stringify(res));
}
