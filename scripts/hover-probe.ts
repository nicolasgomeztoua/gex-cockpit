/**
 * Headless checks for the prior-dot hover behaviour:
 *   a) priors render only when the cursor is over the profile row's bar/dots,
 *      never from mid-chart on the same strike price;
 *   b) the cursor can travel LEFT from the bar out to a prior dot without the
 *      dots vanishing, and hovering a dot shows the prior tooltip.
 *
 * Detection counts "prior blue" pixels (GEXBOT.classic.priors ramp) in a band
 * around the hovered y — a direct measure, immune to repaint noise. The live
 * feed is frozen (mock server stopped once the first snapshot has rendered) so
 * bar/dot geometry cannot shift between a measurement and the hover that tests it.
 *
 *   MOCK=1 bun src/server/index.ts &   # then:
 *   bun scripts/hover-probe.ts
 */
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--window-size=1920,1080"],
  defaultViewport: { width: 1920, height: 1080 },
});
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:4321/", { waitUntil: "networkidle2", timeout: 20_000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 8000)); // SSE + charts settle
  Bun.spawnSync(["sh", "-c", "lsof -ti :4321 | xargs kill 2>/dev/null"]); // freeze the feed
  await new Promise(r => setTimeout(r, 1500));

  await page.evaluate(() => {
    const w = window as any;
    const canvases = () =>
      ([...document.querySelectorAll("canvas")] as HTMLCanvasElement[])
        .filter(c => c.clientWidth > 500 && c.clientHeight > 300)
        .map(c => ({ c, r: c.getBoundingClientRect() }));
    w.__rect = () => {
      const r = canvases()[0].r;
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    };
    /** flatten every chart layer into one band of rows around yCss */
    const band = (yCss: number, half: number) => {
      const list = canvases();
      const r0 = list[0].r;
      const off = document.createElement("canvas");
      off.width = Math.round(r0.width);
      off.height = 2 * half + 1;
      const ctx = off.getContext("2d")!;
      for (const { c, r } of list)
        ctx.drawImage(c, 0, 0, c.width, c.height, r.left - r0.left, r.top - r0.top - (yCss - half), r.width, r.height);
      return { d: ctx.getImageData(0, 0, off.width, off.height).data, w: off.width, h: off.height };
    };
    /** columns holding a classic-priors blue pixel, plus the total count */
    w.__blues = (yCss: number, half: number, fromX: number) => {
      const { d, w: bw, h } = band(yCss, half);
      const cols = new Set<number>();
      let n = 0;
      for (let row = 0; row < h; row++)
        for (let col = fromX; col < bw; col++) {
          const i = (row * bw + col) * 4;
          const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
          if (b > 90 && g > r && b - g > 35) {
            n++;
            cols.add(col);
          }
        }
      return { n, cols: [...cols].sort((a, b) => a - b) };
    };
    /** leftmost non-background column in the profile band (widest drawn bar) */
    w.__barLeft = (yCss: number, half: number, fromX: number) => {
      const { d, w: bw, h } = band(yCss, half);
      for (let col = fromX; col < bw; col++)
        for (let row = 0; row < h; row++) {
          const i = (row * bw + col) * 4;
          if (Math.max(d[i], d[i + 1], d[i + 2]) > 60) return col;
        }
      return bw;
    };
    w.__tip = () => {
      const el = [...document.querySelectorAll("div.z-20")].find(
        e => getComputedStyle(e as HTMLElement).display !== "none",
      ) as HTMLElement | undefined;
      return el ? { text: el.textContent ?? "", color: getComputedStyle(el).color } : null;
    };
  });

  const rect = (await page.evaluate(() => (window as any).__rect())) as {
    left: number; top: number; width: number; height: number;
  };
  const W = Math.round(rect.width);
  const barsLeft = Math.round(W - W * 0.42);
  const X_MID = 600; // mid-chart, left of the bar region
  const X_EDGE = W - 60; // over the bars at the right edge
  const HALF = 12;

  type Blues = { n: number; cols: number[] };
  const hover = async (x: number | null, yCss: number): Promise<Blues> => {
    if (x === null) await page.mouse.move(5, 5); // off the chart -> hover cleared
    else await page.mouse.move(rect.left + x, yCss);
    await new Promise(r => setTimeout(r, 90));
    return (await page.evaluate((y, h, fx) => (window as any).__blues(y, h, fx), yCss, HALF, barsLeft)) as Blues;
  };
  const tip = () => page.evaluate(() => (window as any).__tip()) as Promise<{ text: string; color: string } | null>;

  // ---- (a) gating: dots at the right edge, nothing from mid-chart -----------
  const rows: { y: number; none: number; mid: number; edge: number; cols: number[] }[] = [];
  for (let y = rect.top + 60; y < rect.top + rect.height - 60 && rows.length < 8; y += 3) {
    const edge = await hover(X_EDGE, y);
    if (edge.n < 4) continue;
    const mid = await hover(X_MID, y);
    const none = await hover(null, y);
    rows.push({ y: Math.round(y), none: none.n, mid: mid.n, edge: edge.n, cols: edge.cols });
  }
  const gating = rows.length
    ? rows.every(r => r.mid === 0 && r.none === 0 && r.edge > 0)
      ? "PASS"
      : "FAIL"
    : "INCONCLUSIVE";

  // ---- (b) travel left to the outermost dot: survives + tooltips -----------
  const travels: Record<string, unknown>[] = [];
  for (const row of rows.slice(0, 4)) {
    const dotX = row.cols[0]; // leftmost prior dot drawn on this row
    if (dotX === undefined || dotX >= X_EDGE - 4) continue;
    await hover(null, row.y);
    const barLeft = (await page.evaluate(
      (y, h, fx) => (window as any).__barLeft(y, h, fx),
      row.y,
      HALF,
      barsLeft,
    )) as number;
    await hover(X_EDGE, row.y); // reveal on the bar, then walk left to the dot
    const steps: { x: number; n: number; tip: string | null }[] = [];
    const stride = Math.max(4, Math.floor((X_EDGE - dotX) / 8));
    for (let x = X_EDGE; x > dotX; x -= stride) steps.push({ x, n: (await hover(x, row.y)).n, tip: null });
    const atDot = await hover(dotX, row.y);
    const t = await tip();
    steps.push({ x: dotX, n: atDot.n, tip: t?.text ?? null });
    travels.push({
      y: row.y,
      dotX,
      barLeft,
      dotBeyondEveryBar: dotX < barLeft,
      dotsSurvivedTravel: steps.every(s => s.n > 0),
      dotsAtDot: atDot.n,
      tooltip: t?.text ?? null,
      tooltipColor: t?.color ?? null,
      steps,
    });
    if (travels.length === 1) {
      await page.screenshot({
        path: "/tmp/dot_hover_crop.png",
        clip: { x: rect.left + barsLeft - 40, y: row.y - 30, width: W - barsLeft + 60, height: 60 },
      });
      await page.screenshot({ path: "/tmp/dot_hover.png" });
      await hover(X_MID, row.y);
      await page.screenshot({ path: "/tmp/dot_mid.png" });
    }
  }
  const travel = travels.length
    ? travels.every(t => t.dotsSurvivedTravel && (t.dotsAtDot as number) > 0 && String(t.tooltip).includes("prior"))
      ? "PASS"
      : "FAIL"
    : "INCONCLUSIVE";

  // ---- (c) zoomed look at the dots (max dot should carry a faint ring) -----
  if (rows.length) {
    const row = rows[0];
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 4 });
    await new Promise(r => setTimeout(r, 800));
    const r2 = (await page.evaluate(() => (window as any).__rect())) as typeof rect;
    const W2 = Math.round(r2.width);
    await page.mouse.move(r2.left + W2 - 60, row.y);
    await new Promise(r => setTimeout(r, 200));
    await page.screenshot({
      path: "/tmp/dot_zoom.png",
      clip: { x: r2.left + W2 - 260, y: row.y - 12, width: 260, height: 24 },
    });
  }

  console.log(JSON.stringify({ W, barsLeft, X_MID, X_EDGE, gating, rows, travel, travels }, null, 2));
} finally {
  await browser.close();
}
