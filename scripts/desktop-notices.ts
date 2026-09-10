import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** Preserve dependency license texts in the downloadable app, not just source installs. */
export function writeDesktopNotices(target: string): void {
  const sections = [readFileSync("THIRD_PARTY_NOTICES.md", "utf8"), readFileSync("licenses/Bun-1.3.14.md", "utf8")];
  const visited = new Set<string>();
  function notices(dir: string, heading: string, extra?: string | null) {
    const files = readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isFile() && /^(licen[cs]e|notice|copying)([._-]|$)/i.test(entry.name))
      .map(entry => join(dir, entry.name));
    if (extra && existsSync(resolve(dir, extra))) files.push(resolve(dir, extra));
    sections.push(`\n\n===== ${heading} =====\n`);
    for (const file of [...new Set(files)].sort()) sections.push(readFileSync(file, "utf8"));
  }
  function visitPackage(dir: string) {
    dir = realpathSync(dir);
    if (visited.has(dir)) return;
    visited.add(dir);
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    notices(dir, `${pkg.name} ${pkg.version} (${pkg.license ?? "see upstream"})`);
    for (const name of Object.keys(pkg.dependencies ?? {}).sort()) {
      let current = dir;
      while (!existsSync(join(current, "node_modules", name, "package.json"))) {
        const parent = dirname(current);
        if (parent === current) throw new Error(`Missing installed dependency: ${name}`);
        current = parent;
      }
      visitPackage(join(current, "node_modules", name));
    }
  }
  visitPackage(resolve("."));
  const result = Bun.spawnSync(["cargo", "metadata", "--locked", "--format-version", "1", "--filter-platform", target,
    "--manifest-path", "src-tauri/Cargo.toml"], { stderr: "inherit" });
  if (result.exitCode !== 0) throw new Error("Could not resolve native dependency notices");
  const metadata = JSON.parse(result.stdout.toString()) as {
    packages: Array<{ id: string; name: string; version: string; license: string | null; license_file: string | null; manifest_path: string }>;
    resolve: { nodes: Array<{ id: string }> };
  };
  const included = new Set(metadata.resolve.nodes.map(node => node.id));
  for (const pkg of metadata.packages.filter(pkg => included.has(pkg.id)).sort((a, b) => a.name.localeCompare(b.name))) {
    notices(dirname(pkg.manifest_path), `${pkg.name} ${pkg.version} (${pkg.license ?? "see upstream"})`, pkg.license_file);
  }
  writeFileSync("src-tauri/binaries/THIRD_PARTY_LICENSES.txt", sections.join("\n"));
}
