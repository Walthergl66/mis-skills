import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ascii, rootDir, skillSummaries, toTitle } from "./lib/skills.mjs";

const summaries = skillSummaries();
const outputPath = join(rootDir, "docs", "SKILLS.md");

let markdown = `# Skill Inventory\n\n`;
markdown += `Canonical source: \`.agents/skills\`.\n\n`;
markdown += `This file is generated from installed \`SKILL.md\` frontmatter. Run \`npm run inventory\` after adding, removing, or updating skills.\n\n`;
markdown += `## Installed Skills\n\n`;

for (const skill of summaries) {
  markdown += `### ${toTitle(skill.name)}\n\n`;
  markdown += `- Folder: \`${skill.folder}\`\n`;
  markdown += `- Path: \`${skill.path}\`\n`;
  markdown += `- Purpose: ${ascii(skill.description)}\n\n`;
}

if (summaries.length === 0) {
  markdown += `No skills are installed yet. Run \`npm run install:skills\` or add a folder under \`.agents/skills/<skill-name>/SKILL.md\`.\n`;
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, markdown, "utf8");
console.log(`Wrote ${outputPath}`);
