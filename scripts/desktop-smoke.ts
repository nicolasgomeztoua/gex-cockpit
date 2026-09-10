import { mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { strict as assert } from "node:assert";

// Exercise the distributed executable from a clean user folder. No API key or
// synthetic market data is used. This checks packaging, auth, SQLite and lifetime.
const binary = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("Pass the compiled backend executable");
const dir = mkdtempSync(join(tmpdir(), "gex-desktop-smoke-"));
const resources = join(dir, "resources");
mkdirSync(resources);
cpSync("drizzle", join(resources, "drizzle"), { recursive: true });
// A stray .env must never configure a compiled desktop backend.
writeFileSync(join(dir, ".env"), "PORT=1\nREPLAY=not-a-date\nGEXBOT_API_KEY=must-not-load\n");
const token = crypto.randomUUID().replaceAll("-", "");
const child = Bun.spawn([binary], {
  cwd: dir, stdin: "pipe", stdout: "pipe", stderr: "pipe",
  env: { PATH: "", SystemRoot: process.env.SystemRoot, GEX_DESKTOP: "1", PORT: "0", GEX_SESSION_TOKEN: token,
    NODE_ENV: "production", GEX_RESOURCE_DIR: resources, DB_PATH: join(dir, "saved", "gex-cockpit.db") },
});
const timeout = setTimeout(() => { child.kill(); }, 25_000);
try {
  const reader = child.stdout.getReader();
  let output = "";
  let port = 0;
  while (!port) {
    const chunk = await reader.read();
    if (chunk.done) throw new Error(`Backend exited before readiness (exit ${await child.exited}, signal ${child.signalCode}): ${output} ${await new Response(child.stderr).text()}`);
    output += new TextDecoder().decode(chunk.value);
    for (const line of output.split("\n")) {
      try { const msg = JSON.parse(line); if (msg.type === "ready") port = msg.port; } catch { /* Other log lines. */ }
    }
  }
  const base = `http://127.0.0.1:${port}`;
  const headers = { "x-gex-session": token, origin: "tauri://localhost", "content-type": "application/json" };
  assert.equal((await fetch(`${base}/api/health`)).status, 401);
  assert.equal((await fetch(`${base}/api/health`, { headers })).status, 200);
  assert.equal((await fetch(`${base}/api/health`, { headers: { ...headers, origin: "https://example.com" } })).status, 403);
  assert.equal((await fetch(`${base}/api/settings`, { method: "PUT", headers, body: '{"desktopSmoke":true}' })).status, 200);
  const settings = await (await fetch(`${base}/api/settings`, { headers })).json();
  assert.equal(settings.settings.desktopSmoke, true);
  const abort = new AbortController();
  const stream = await fetch(`${base}/api/stream`, { headers, signal: abort.signal });
  assert.equal(stream.status, 200);
  assert.match(new TextDecoder().decode((await stream.body!.getReader().read()).value), /event: init/);
  abort.abort();
  child.stdin.end();
  assert.equal(await child.exited, 0, "Backend must stop when its desktop parent closes stdin");
  assert(await Bun.file(join(dir, "saved", "gex-cockpit.db")).exists());
  console.log("Desktop executable passed: standalone startup, private API, streaming, settings, SQLite migrations, parent-exit cleanup.");
} finally {
  clearTimeout(timeout);
  child.kill();
  await child.exited;
  rmSync(dir, { recursive: true, force: true });
}
