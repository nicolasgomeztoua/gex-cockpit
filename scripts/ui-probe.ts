/**
 * Headless UI probe: loads the app, flips a named sidebar control, and reports
 * what actually changed (localStorage path diff + before/after screenshots).
 *
 *   bun scripts/ui-probe.ts "Major Short Gamma"          # main line switch
 *   bun scripts/ui-probe.ts "Major Short Gamma" label    # chart-label mini-toggle
 *   bun scripts/ui-probe.ts "Zero Gamma" alert           # alert mini-toggle
 *   bun scripts/ui-probe.ts --alert-smoke                # test backend desktop notification delivery
 */
import puppeteer from "puppeteer-core";

const arg = process.argv[2] ?? "Major Short Gamma";
const control = (process.argv[3] ?? "line") as "line" | "label" | "alert";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SETTINGS_KEY = "gex-cockpit-settings-v4"; // localStorage mirror; source of truth is /api/settings

/** Flatten to "levels.msg.line"-style paths for diffing. */
function flatten(obj: unknown, prefix = "", out: Record<string, unknown> = {}) {
  if (typeof obj !== "object" || obj === null) {
    out[prefix] = obj;
    return out;
  }
  for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--window-size=1920,1080"],
  defaultViewport: { width: 1920, height: 1080 },
});
try {
  const page = await browser.newPage();
  const ctx = browser.defaultBrowserContext();
  await ctx.overridePermissions("http://127.0.0.1:4321", ["notifications"]);
  await page.goto("http://127.0.0.1:4321/", { waitUntil: "networkidle2", timeout: 20_000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 6000)); // let SSE + charts settle

  const readSettings = () =>
    page.evaluate(() => fetch("/api/settings").then(r => r.json()).then(j => JSON.stringify(j.settings ?? {})));

  // expand the sidebar if it starts collapsed
  await page.evaluate(() => {
    const sidebar = document.querySelector('[data-slot="sidebar"]');
    if (sidebar?.getAttribute("data-state") === "collapsed") {
      (document.querySelector('[data-slot="sidebar-trigger"]') as HTMLElement | null)?.click();
    }
  });
  await new Promise(r => setTimeout(r, 500));
  // level rows live in the settings view — open it from the main view
  await page.evaluate(() => {
    (document.querySelector('[data-probe="open-settings"]') as HTMLElement | null)?.click();
  });
  await new Promise(r => setTimeout(r, 400));

  if (arg === "--alert-smoke") {
    // Exercise the real backend delivery path without changing saved levels or settings.
    const result = await page.evaluate(async () => {
      const response = await fetch("/api/alerts/test", {
        method: "POST", headers: { "content-type": "application/json" }, body: "{}",
      });
      return { ok: response.ok, status: response.status, result: await response.json() };
    });
    await page.screenshot({ path: "/tmp/probe_after.png" });
    console.log(JSON.stringify(result, null, 2));
  } else {
    const before = JSON.parse(await readSettings());
    await page.screenshot({ path: "/tmp/probe_before.png" });

    const clicked = await page.evaluate(
      (lbl, ctl) => {
        const nodes = [...document.querySelectorAll('[data-slot="sidebar"] *')] as HTMLElement[];
        const row = nodes
          .find(n => n.childElementCount === 0 && n.textContent?.trim() === lbl)
          ?.closest("div[data-level], div, label");
        if (!row) return "label not found (section collapsed?)";
        const target =
          ctl === "line"
            ? row.querySelector<HTMLElement>('button[role="switch"]')
            : row.querySelector<HTMLElement>(`[data-probe="${ctl}"]`);
        if (!target) return `no ${ctl} control in row`;
        target.click();
        return `clicked ${ctl}`;
      },
      arg,
      control,
    );

    await new Promise(r => setTimeout(r, 1500));
    const after = JSON.parse(await readSettings());
    await page.screenshot({ path: "/tmp/probe_after.png" });

    const flatBefore = flatten(before);
    const flatAfter = flatten(after);
    const changedPaths = [...new Set([...Object.keys(flatBefore), ...Object.keys(flatAfter)])]
      .filter(k => JSON.stringify(flatBefore[k]) !== JSON.stringify(flatAfter[k]))
      .sort();
    console.log(JSON.stringify({ label: arg, control, clicked, changedPaths }, null, 2));
  }
} finally {
  await browser.close();
}
