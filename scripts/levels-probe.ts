/**
 * Headless checks for the bar-anchored major level lines:
 *   a) every level draws as a DOTTED hairline (only ~a fifth of the sampled
 *      columns are painted, versus a solid line's 100%);
 *   b) each line rides the centre of ITS OWN bar — measured against that bar's
 *      colour at the right edge, and contrasted with the other profile's bar in
 *      the same strike slot;
 *   c) the Price Axis Labels toggle still drives the axis pills;
 *   d) a level's label flag renders its name left of the profile band.
 * Writes 4x-zoom crops to /tmp/lv_*.png so the centring can be eyeballed.
 *
 *   MOCK=1 bun src/server/index.ts &   # then:
 *   bun scripts/levels-probe.ts
 */
import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
// line colour = LEVEL_META, bar colour = the profile bar it should sit on
const LEVELS = [
  { key: "mlg", anchor: "state", line: [77, 227, 242], bar: [77, 227, 242] },
  { key: "msg", anchor: "state", line: [169, 77, 232], bar: [169, 77, 232] },
  { key: "mpo", anchor: "oi", line: [62, 145, 66], bar: [47, 125, 51] },
  { key: "mno", anchor: "oi", line: [158, 36, 27], bar: [140, 31, 23] },
] as const;
const PURPLE = [169, 77, 232];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--window-size=1920,1080"],
  defaultViewport: { width: 1920, height: 1080 },
});
try {
  const page = await browser.newPage();
  const goto = async () => {
    await page.goto("http://127.0.0.1:4321/", { waitUntil: "networkidle2", timeout: 20_000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 7000));
    await inject();
  };
  const setNdx = (patch: Record<string, unknown>) =>
    page.evaluate(async p => {
      const j = await fetch("/api/settings").then(r => r.json());
      const s = j.settings ?? {};
      s.tickers = { ...s.tickers, NDX: { ...(s.tickers?.NDX ?? {}), ...p } };
      await fetch("/api/settings", { method: "PUT", body: JSON.stringify(s) });
      localStorage.removeItem("gex-cockpit-settings-v4");
    }, patch);

  const inject = () =>
    page.evaluate(() => {
      const w = window as any;
      const panes = () =>
        ([...document.querySelectorAll("canvas")] as HTMLCanvasElement[])
          .filter(c => c.clientWidth > 500 && c.clientHeight > 300)
          .map(c => ({ c, r: c.getBoundingClientRect() }));
      /** the first chart's layers (pane + price axis) flattened into one bitmap */
      const flat = () => {
        const r0 = panes()[0].r;
        const all = ([...document.querySelectorAll("canvas")] as HTMLCanvasElement[]).map(c => ({
          c,
          r: c.getBoundingClientRect(),
        }));
        const off = document.createElement("canvas");
        off.width = Math.round(r0.width) + 120;
        off.height = Math.round(r0.height);
        const ctx = off.getContext("2d")!;
        for (const { c, r } of all) {
          if (r.top >= r0.bottom || r.bottom <= r0.top) continue; // the other chart
          ctx.drawImage(c, 0, 0, c.width, c.height, r.left - r0.left, r.top - r0.top, r.width, r.height);
        }
        return { d: ctx.getImageData(0, 0, off.width, off.height).data, w: off.width, h: off.height };
      };
      const near = (d: Uint8ClampedArray, i: number, rgb: number[], tol: number) =>
        Math.abs(d[i] - rgb[0]) <= tol && Math.abs(d[i + 1] - rgb[1]) <= tol && Math.abs(d[i + 2] - rgb[2]) <= tol;
      w.__rect = () => {
        const r = panes()[0].r;
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      };
      /** rows where a colour appears in [x0,x1), with the painted-column count */
      w.__rows = (rgb: number[], x0: number, x1: number, tol: number, min: number) => {
        const { d, w: bw, h } = flat();
        const out: { y: number; n: number }[] = [];
        for (let y = 0; y < h; y++) {
          let n = 0;
          for (let x = x0; x < Math.min(x1, bw); x++) if (near(d, (y * bw + x) * 4, rgb, tol)) n++;
          if (n >= min) out.push({ y, n });
        }
        return out;
      };
      w.__count = (rgb: number[], x0: number, y0: number, x1: number, y1: number, tol: number) => {
        const { d, w: bw, h } = flat();
        let n = 0;
        for (let y = Math.max(0, y0); y < Math.min(y1, h); y++)
          for (let x = Math.max(0, x0); x < Math.min(x1, bw); x++) if (near(d, (y * bw + x) * 4, rgb, tol)) n++;
        return n;
      };
      w.__tip = () => {
        const el = [...document.querySelectorAll("div.z-20")].find(
          e => getComputedStyle(e as HTMLElement).display !== "none",
        ) as HTMLElement | undefined;
        return el ? el.textContent ?? "" : null;
      };
    });

  const allLevels = (label: boolean) =>
    Object.fromEntries(
      ["mlg", "msg", "zg", "mpv", "mnv", "mpo", "mno"].map(l => [l, { line: true, label, alert: false }]),
    );

  await goto();
  const rows = (rgb: readonly number[], x0: number, x1: number, tol: number, min: number) =>
    page.evaluate((c, a, b, t, m) => (window as any).__rows(c, a, b, t, m), [...rgb], x0, x1, tol, min) as Promise<
      { y: number; n: number }[]
    >;
  const count = (rgb: readonly number[], box: number[], tol = 40) =>
    page.evaluate((c, b, t) => (window as any).__count(c, b[0], b[1], b[2], b[3], t), [...rgb], box, tol) as Promise<number>;
  const rect = (await page.evaluate(() => (window as any).__rect())) as {
    left: number; top: number; width: number; height: number;
  };
  const W = Math.round(rect.width);
  const barsLeft = Math.round(W - W * 0.42);
  const out: Record<string, unknown> = { W, barsLeft };
  const dotted = (rs: { y: number; n: number }[]) => rs.filter(r => r.n <= 200);
  /** per level: where its line is, and how much of its colour sits in the label slot */
  const scan = async () => {
    const o: Record<string, { lineY: number; label: number }> = {};
    for (const lv of LEVELS) {
      const line = dotted(await rows(lv.line, 40, 340, 22, 20));
      if (!line.length) continue;
      const y0 = line[0].y;
      o[lv.key] = { lineY: y0, label: await count(lv.line, [barsLeft - 170, y0 - 13, barsLeft - 8, y0 - 3]) };
    }
    return o;
  };

  // ---- (c)(d) pills + labels OFF -------------------------------------------
  await setNdx({ axisLabels: false, stateBars: true, volBars: false, oiBars: true, levels: allLevels(false) });
  await goto();
  out.pillsOff = await count(PURPLE, [W + 4, 0, W + 90, 4000], 30);
  const off = await scan();
  out.labelsOff = off;

  // ---- (c)(d) pills + labels ON --------------------------------------------
  await setNdx({ axisLabels: true, levels: allLevels(true) });
  await goto();
  out.pillsOn = await count(PURPLE, [W + 4, 0, W + 90, 4000], 30);
  const on = await scan();
  out.labelsOn = on;
  const shared = Object.keys(on).filter(k => k in off);
  out.labelDelta = Object.fromEntries(shared.map(k => [k, on[k].label - off[k].label]));
  out.msgLineY = on.msg?.lineY ?? Object.values(on)[0]?.lineY ?? null;

  // ---- (a)(b) dotted + centred on its own bar ------------------------------
  Bun.spawnSync(["sh", "-c", "lsof -ti :4321 | xargs kill 2>/dev/null"]); // freeze the feed
  await new Promise(r => setTimeout(r, 1200));
  // stretch the price scale so the sub-bars are tall enough to measure
  await page.mouse.move(rect.left + W + 30, rect.top + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.left + W + 30, rect.top + rect.height / 2 - 110, { steps: 20 });
  await page.mouse.up();
  await page.mouse.move(5, 5);
  await new Promise(r => setTimeout(r, 600));

  const results: Record<string, unknown>[] = [];
  for (const lv of LEVELS) {
    const line = dotted(await rows(lv.line, 40, 340, 22, 20));
    if (!line.length) {
      results.push({ key: lv.key, found: false }); // scrolled out of view by the zoom
      continue;
    }
    const lineY = line[0].y;
    const own = (await rows(lv.bar, W - 40, W - 2, 18, 30)).filter(r => Math.abs(r.y - lineY) <= 12);
    const ownMid = own.length ? (own[0].y + own[own.length - 1].y) / 2 : null;
    const otherA = lv.anchor === "state" ? [47, 125, 51] : [77, 227, 242];
    const otherB = lv.anchor === "state" ? [140, 31, 23] : [169, 77, 232];
    const other = [
      ...(await rows(otherA, W - 40, W - 2, 18, 30)),
      ...(await rows(otherB, W - 40, W - 2, 18, 30)),
    ].filter(r => Math.abs(r.y - lineY) <= 12);
    const otherMid = other.length ? (other[0].y + other[other.length - 1].y) / 2 : null;
    results.push({
      key: lv.key,
      anchor: lv.anchor,
      lineY,
      paintedOf300: line[0].n,
      ownBarRows: own.map(r => r.y),
      lineMinusOwnBarMid: ownMid === null ? null : +(lineY - ownMid).toFixed(1),
      lineMinusOtherBarMid: otherMid === null ? null : +(lineY - otherMid).toFixed(1),
    });
  }
  out.levels = results;

  // level tooltip still fires on the level's price row
  const anyLine = results.find(r => r.lineY) as { lineY: number } | undefined;
  if (anyLine) {
    await page.mouse.move(rect.left + 400, rect.top + anyLine.lineY);
    await new Promise(r => setTimeout(r, 160));
    out.levelTooltip = await page.evaluate(() => (window as any).__tip());
  }

  console.log(JSON.stringify(out, null, 2));

  // ---- 4x crops -------------------------------------------------------------
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 4 });
  await new Promise(r => setTimeout(r, 1000));
  await inject();
  const r2 = (await page.evaluate(() => (window as any).__rect())) as typeof rect;
  for (const lv of LEVELS) {
    const line = (await rows(lv.line, 40, 340, 22, 20)).filter(r => r.n <= 800);
    if (!line.length) continue;
    await page.screenshot({
      path: `/tmp/lv_${lv.key}.png`,
      clip: { x: r2.left + r2.width - 120, y: r2.top + line[0].y - 10, width: 120, height: 20 },
    });
  }
  if (out.msgLineY !== null && typeof out.msgLineY === "number") {
    await page.screenshot({
      path: "/tmp/lv_label.png",
      clip: { x: r2.left + barsLeft - 180, y: r2.top + (out.msgLineY as number) - 16, width: 200, height: 24 },
    });
  }
  await page.screenshot({
    path: "/tmp/lv_full.png",
    clip: { x: r2.left, y: r2.top, width: r2.width + 90, height: 420 },
  });
} finally {
  await browser.close();
}
