/**
 * Headless UI probe: loads the app, flips a named sidebar toggle, and reports
 * what actually changed (localStorage diff + before/after screenshots).
 *
 *   bun scripts/ui-probe.ts "Major Short Gamma"
 */
import puppeteer from "puppeteer-core";

const label = process.argv[2] ?? "Major Short Gamma";
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
  await new Promise(r => setTimeout(r, 6000)); // let SSE + charts settle

  const readSettings = () =>
    page.evaluate(() => localStorage.getItem("gex-cockpit-settings-v2") ?? "{}");

  const before = JSON.parse(await readSettings());
  await page.screenshot({ path: "/tmp/probe_before.png" });

  const clicked = await page.evaluate(lbl => {
    const nodes = [...document.querySelectorAll("aside *")] as HTMLElement[];
    const row = nodes.find(n => n.childElementCount === 0 && n.textContent?.trim() === lbl);
    if (!row) return "label not found";
    const rowEl = row.closest("div, label");
    const btn = rowEl?.parentElement
      ?.querySelector(`button[role="switch"], button`) as HTMLElement | null;
    // search within the same row first
    const inRow = rowEl?.querySelector(`button[role="switch"], button`) as HTMLElement | null;
    (inRow ?? btn)?.click();
    return inRow ? "clicked in-row" : btn ? "clicked sibling" : "no button";
  }, label);

  await new Promise(r => setTimeout(r, 1500));
  const after = JSON.parse(await readSettings());
  await page.screenshot({ path: "/tmp/probe_after.png" });

  const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    k => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
  );
  console.log(JSON.stringify({ label, clicked, changedKeys: changed, before, after }, null, 2));
} finally {
  await browser.close();
}
