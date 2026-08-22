/**
 * Headless check for bar-gated prior dots: priors must render only when the
 * cursor is over the drawn bar at the right edge, not anywhere on the strike row.
 *
 * Detection counts "prior blue" pixels (GEXBOT.classic.priors ramp) in a band
 * around the hovered y — a direct measure, immune to live-feed repaint noise.
 *
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
    /** blue prior-dot pixels in [fromX, width) of a band around yCss */
    w.__blues = (yCss: number, half: number, fromX: number) => {
      const list = canvases();
      const r0 = list[0].r;
      const off = document.createElement("canvas");
      off.width = Math.round(r0.width);
      off.height = 2 * half + 1;
      const ctx = off.getContext("2d")!;
      for (const { c, r } of list)
        ctx.drawImage(c, 0, 0, c.width, c.height, r.left - r0.left, r.top - r0.top - (yCss - half), r.width, r.height);
      const d = ctx.getImageData(0, 0, off.width, off.height).data;
      let n = 0;
      for (let row = 0; row < off.height; row++)
        for (let col = fromX; col < off.width; col++) {
          const i = (row * off.width + col) * 4;
          const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
          if (b > 90 && g > r && b - g > 35) n++; // classic priors ramp
        }
      return n;
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

  const hover = async (x: number | null, yCss: number) => {
    if (x === null) await page.mouse.move(5, 5); // off the chart -> hover cleared
    else await page.mouse.move(rect.left + x, yCss);
    await new Promise(r => setTimeout(r, 110));
    return (await page.evaluate((y, h, fx) => (window as any).__blues(y, h, fx), yCss, HALF, barsLeft)) as number;
  };

  const rows: { y: number; none: number; mid: number; edge: number }[] = [];
  for (let y = rect.top + 60; y < rect.top + rect.height - 60 && rows.length < 8; y += 3) {
    const edge = await hover(X_EDGE, y);
    if (edge < 4) continue;
    const mid = await hover(X_MID, y);
    const none = await hover(null, y);
    rows.push({ y: Math.round(y), none, mid, edge });
  }

  const verdict = rows.length
    ? rows.every(r => r.mid === 0 && r.none === 0 && r.edge > 0)
      ? "PASS — priors only at the right-edge bar"
      : "FAIL — priors leaked to mid-chart or no-hover"
    : "INCONCLUSIVE — no prior dots found at any y";
  console.log(JSON.stringify({ W, barsLeft, X_MID, X_EDGE, rows, verdict }, null, 2));

  if (rows.length) {
    const y = rows[0].y;
    const clip = { x: rect.left + barsLeft, y: y - 26, width: W - barsLeft, height: 52 };
    await hover(X_MID, y);
    await page.screenshot({ path: "/tmp/hover_mid_crop.png", clip });
    await page.screenshot({ path: "/tmp/hover_mid.png" });
    await hover(X_EDGE, y);
    await page.screenshot({ path: "/tmp/hover_edge_crop.png", clip });
    await page.screenshot({ path: "/tmp/hover_edge.png" });
    console.log("screenshots at /tmp/hover_{mid,edge}{,_crop}.png for y=" + y);
  }
} finally {
  await browser.close();
}
