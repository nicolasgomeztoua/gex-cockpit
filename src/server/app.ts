import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { api } from "./routes";
import { DESKTOP, desktopAuth } from "./desktop";

export type { AppType } from "./routes";

const REPO_ROOT = resolve(import.meta.dir, "../..");
const DIST_DIR = join(REPO_ROOT, "dist");
/** hono/bun resolves static paths against the cwd, so hand it a cwd-relative one. */
const distRelative = relative(process.cwd(), DIST_DIR) || ".";

/** In dev the Vite server owns the HTML and assets; the backend is API-only. */
const isDev = process.env.NODE_ENV === "development";

export function buildDist(): void {
  console.log("[server] dist/ missing — running `vite build`…");
  const built = Bun.spawnSync(["bun", "x", "vite", "build"], {
    cwd: REPO_ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (!built.success) {
    console.error("[server] vite build failed — run `bun run build` and retry");
    process.exit(1);
  }
}

export const app = new Hono();
if (DESKTOP) app.use("*", desktopAuth(process.env.GEX_SESSION_TOKEN ?? "", process.env.GEX_DESKTOP_DEV === "1"));
app.route("/", api);

// Unknown API paths must stay 404s; the production SPA fallback is only for
// browser navigation, never for a misspelled endpoint.
app.all("/api/*", c => c.text("Not Found", 404));

if (!isDev && !DESKTOP) {
  if (!existsSync(join(DIST_DIR, "index.html"))) buildDist();
  app.use("*", serveStatic({ root: distRelative }));
  const serveIndex = serveStatic({ path: `${distRelative}/index.html` });
  // SPA fallback is only for browser navigations. A missing asset must stay a
  // 404 instead of returning index.html with the wrong MIME type.
  app.get("*", async (c, next) => {
    const acceptsHtml = (c.req.header("accept") ?? "")
      .split(",")
      .some(value => value.trim().startsWith("text/html"));
    const isNavigation = c.req.header("sec-fetch-mode") === "navigate" || acceptsHtml;
    const hasFileExtension = /\.[^/]+$/.test(c.req.path);
    if (!isNavigation || hasFileExtension) return c.text("Not Found", 404);
    return (await serveIndex(c, next)) ?? c.res;
  });
}

app.notFound(c => c.text("Not Found", 404));
