import { mkdirSync } from "node:fs";

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
const result = Bun.spawnSync([
  process.execPath, "build", "src/server/index.ts", "--compile", `--target=${targets[target]}`,
  "--no-compile-autoload-dotenv", "--no-compile-autoload-bunfig", "--outfile", output,
], { stdout: "inherit", stderr: "inherit" });
if (result.exitCode !== 0) process.exit(result.exitCode);
// Apple Silicon refuses to execute an unsigned Mach-O. This local ad-hoc
// signature is free; it is not Developer ID signing or notarization.
if (process.platform === "darwin" && target.endsWith("apple-darwin")) {
  const signed = Bun.spawnSync(["/usr/bin/codesign", "--force", "--sign", "-", "--timestamp=none", "--entitlements", "src-tauri/Entitlements.plist", output], { stdout: "inherit", stderr: "inherit" });
  if (signed.exitCode !== 0) process.exit(signed.exitCode);
}
console.log(`Bundled standalone backend: ${target}`);
