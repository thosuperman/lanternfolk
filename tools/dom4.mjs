export default async function run({ page, frame }) {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addStyleTag({ content: `#workspace-runtime-frame{position:fixed!important;left:0!important;top:0!important;width:100vw!important;height:100vh!important;z-index:2147483646!important}` });
  await new Promise((r) => setTimeout(r, 12000));
  const fr = await frame.evaluate(() => [innerWidth, innerHeight, ...[...document.querySelectorAll('canvas')].map(c=>c.width+'x'+c.height)]);
  console.log(JSON.stringify({ fr }));
}
