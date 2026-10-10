import { existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { readRegistry, skillsDir } from "./lib/skills.mjs";

const registry = readRegistry();
const sources = registry.sources.filter((item) => item.status !== "disabled");
const excluded = new Set(registry.excludeSkills ?? []);
const failed = [];

for (const item of sources) {
  console.log(`Installing ${item.source}`);
  const result = spawnSync("npx", ["--yes", "skills", "add", item.source, "-a", "codex", "--copy", "-y"], {
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.status !== 0) {
    failed.push(item.source);
    console.warn(`Install failed: ${item.source}`);
  }
}

// Remove skills the repo deliberately curates out of an external pack. Without this,
// a re-install would resurrect skills the catalog no longer ships.
for (const name of excluded) {
  const dir = join(skillsDir, name);
  if (!existsSync(dir)) continue;
  rmSync(dir, { recursive: true, force: true });
  console.log(`Excluded ${name} (registry.excludeSkills)`);
}

if (failed.length > 0) {
  console.warn("\nSome sources did not install:");
  for (const source of failed) console.warn(`- ${source}`);
  console.warn("Keep them as planned in registry/skills.json until their URLs or permissions are fixed.");
}

process.exit(0);
