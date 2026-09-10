import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const targets: Record<string, string> = {
  "aarch64-apple-darwin": "bun-darwin-arm64",
  "x86_64-apple-darwin": "bun-darwin-x64",
  "x86_64-pc-windows-msvc": "bun-windows-x64-baseline",
};
const host = Bun.spawnSync(["rustc", "--print", "host-tuple"]);
if (host.exitCode !== 0) throw new Error("Install the Rust toolchain first");
const target = process.env.TAURI_ENV_TARGET_TRIPLE || host.stdout.toString().trim();
if (!targets[target]) throw new Error(`Unsupported desktop target: ${target}`);
mkdirSync("src-tauri/binaries", { recursive: true });
const output = `src-tauri/binaries/gex-backend-${target}${target.includes("windows") ? ".exe" : ""}`;
const extra: string[] = [];
if (process.platform === "win32") {
  // Bun 1.3.14's automatic baseline-runtime extraction fails on Windows.
  // Use the official, checksummed archive explicitly; baseline supports CPUs without AVX2.
  if (Bun.version !== "1.3.14") throw new Error("Use the Bun version in .bun-version and update the pinned desktop runtime together");
  const cache = resolve("src-tauri/binaries/.runtime");
  mkdirSync(cache, { recursive: true });
  const archive = `${cache}/bun-windows-x64-baseline.zip`;
  if (!(await Bun.file(archive).exists())) {
    const response = await fetch("https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/bun-windows-x64-baseline.zip");
    if (!response.ok) throw new Error("Could not download the Windows build runtime");
    await Bun.write(archive, response);
  }
  const digest = createHash("sha256").update(new Uint8Array(await Bun.file(archive).arrayBuffer())).digest("hex");
  if (digest !== "538f9c846355d9e847b2671bc00c47da4229a0befb24df3282b739770f3b475f") throw new Error("Windows runtime checksum mismatch");
  const extracted = Bun.spawnSync(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
    "Expand-Archive -LiteralPath $env:GEX_BUN_ZIP -DestinationPath $env:GEX_BUN_EXTRACT -Force"], {
    env: { ...process.env, GEX_BUN_ZIP: archive, GEX_BUN_EXTRACT: cache }, stdout: "inherit", stderr: "inherit",
  });
  if (extracted.exitCode !== 0) throw new Error("Could not extract the Windows build runtime");
  extra.push("--compile-executable-path", `${cache}/bun-windows-x64-baseline/bun.exe`, "--windows-hide-console");
}
const result = Bun.spawnSync([
  process.execPath, "build", "src/server/index.ts", "--compile", `--target=${targets[target]}`,
  "--no-compile-autoload-dotenv", "--no-compile-autoload-bunfig", ...extra, "--outfile", output,
], { stdout: "inherit", stderr: "inherit" });
if (result.exitCode !== 0) process.exit(result.exitCode);
// Apple Silicon refuses to execute an unsigned Mach-O. This local ad-hoc
// signature is free; it is not Developer ID signing or notarization.
if (process.platform === "darwin" && target.endsWith("apple-darwin")) {
  const signed = Bun.spawnSync(["/usr/bin/codesign", "--force", "--sign", "-", "--timestamp=none", "--entitlements", "src-tauri/Entitlements.plist", output], { stdout: "inherit", stderr: "inherit" });
  if (signed.exitCode !== 0) process.exit(signed.exitCode);
}
console.log(`Bundled standalone backend: ${target}`);
