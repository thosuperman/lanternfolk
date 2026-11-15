export default async function run({ page, frame }) {
  const fr = await frame.evaluate(() => [innerWidth, innerHeight, ...[...document.querySelectorAll('canvas')].map(c=>c.width+'x'+c.height+'/'+c.clientWidth+'x'+c.clientHeight)]);
  console.log(JSON.stringify({ vp: page.viewportSize(), fr }));
}
