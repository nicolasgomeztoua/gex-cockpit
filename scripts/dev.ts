/**
 * `bun run dev` — the API backend and the Vite dev server as one command.
 *
 * Vite owns the page (HMR) on VITE_PORT and proxies /api, including the SSE
 * stream, to the backend on PORT. Either process exiting takes the pair down, so
 * a half-running dev setup can't be mistaken for a working one.
 */
export {};

const PORT = process.env.PORT ?? "4321";
const VITE_PORT = process.env.VITE_PORT ?? "5173";

// Hard restart the backend on edits. `--hot` preserves process state, so its
// infinite poll loops survive module reloads and multiply after every save.
const backend = Bun.spawn(["bun", "--watch", "src/server/index.ts"], {
  env: { ...process.env, PORT, NODE_ENV: "development" },
  stdout: "inherit",
  stderr: "inherit",
});

const vite = Bun.spawn(["bun", "x", "vite"], {
  env: { ...process.env, PORT, VITE_PORT },
  stdout: "inherit",
  stderr: "inherit",
});

let shuttingDown = false;
const shutdown = (code: number) => {
  if (shuttingDown) return;
  shuttingDown = true;
  backend.kill();
  vite.kill();
  process.exit(code);
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log(`[dev] api http://127.0.0.1:${PORT} · app http://127.0.0.1:${VITE_PORT}`);

shutdown(await Promise.race([backend.exited, vite.exited]));
