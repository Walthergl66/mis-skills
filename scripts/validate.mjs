import { existsSync } from "node:fs";
import { join } from "node:path";
import { listSkillDirs, parseSkillMarkdown, skillsDir } from "./lib/skills.mjs";

const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const errors = [];
const seenNames = new Map();
const seenDescriptions = new Map();

if (!existsSync(skillsDir)) {
  errors.push(`Missing canonical skills directory: ${skillsDir}`);
}

for (const entry of listSkillDirs()) {
  const skillFile = join(entry.dir, "SKILL.md");
  const parsed = parseSkillMarkdown(skillFile);

  if (!namePattern.test(entry.name)) {
    errors.push(`${entry.name}: folder must use lowercase kebab-case.`);
  }
  if (!parsed.name) {
    errors.push(`${entry.name}: SKILL.md frontmatter must include name.`);
  }
  if (!parsed.description) {
    errors.push(`${entry.name}: SKILL.md frontmatter must include description.`);
  }
  if (parsed.name && parsed.name !== entry.name) {
    errors.push(`${entry.name}: frontmatter name "${parsed.name}" must match folder name.`);
  }
  if (parsed.name) {
    const previous = seenNames.get(parsed.name);
    if (previous) errors.push(`${entry.name}: duplicate skill name also used by ${previous}.`);
    seenNames.set(parsed.name, entry.name);
  }
  if (parsed.description) {
    const normalized = parsed.description.toLowerCase().replace(/\s+/g, " ").trim();
    const previous = seenDescriptions.get(normalized);
    if (previous) errors.push(`${entry.name}: duplicate description also used by ${previous}.`);
    seenDescriptions.set(normalized, entry.name);
  }
}

if (errors.length > 0) {
  console.error("Validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Validated ${listSkillDirs().length} skills in .agents/skills.`);
