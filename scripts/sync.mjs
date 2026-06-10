import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { listSkillDirs, rootDir, skillsDir } from "./lib/skills.mjs";

const adapterMap = {
  codex: [],
  cursor: ["adapters/cursor/skills"],
  gemini: ["adapters/gemini/skills"],
  claude: ["adapters/claude/skills"],
  opencode: ["adapters/opencode/skills"],
  copilot: ["adapters/copilot/skills"]
};

const requested = process.argv.slice(2);
const adapters = requested.length > 0 ? requested : Object.keys(adapterMap);
const skills = listSkillDirs(skillsDir);

for (const adapter of adapters) {
  const targets = adapterMap[adapter];
  if (!targets) {
    console.warn(`Skipping unknown adapter: ${adapter}`);
    continue;
  }
  if (targets.length === 0) {
    console.log(`${adapter}: canonical skills already live in .agents/skills`);
    continue;
  }

  for (const target of targets) {
    const targetDir = join(rootDir, target);
    mkdirSync(targetDir, { recursive: true });
    for (const skill of skills) {
      const destination = join(targetDir, skill.name);
      if (existsSync(destination)) rmSync(destination, { recursive: true, force: true });
      cpSync(skill.dir, destination, { recursive: true });
    }
    console.log(`Synced ${skills.length} skills to ${target}`);
  }
}
