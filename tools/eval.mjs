// Dev helper: evaluate a JS expression (from $EXPR) inside the running app page.
export default async function run({ page, frame }) {
  const target = frame ?? page;
  const expr = process.env.EXPR || 'document.title';
  const value = await target.evaluate(async (e) => {
    // eslint-disable-next-line no-eval
    const v = await (0, eval)(e);
    return JSON.parse(JSON.stringify(v ?? null));
  }, expr);
  console.log(JSON.stringify(value));
  return value;
}
