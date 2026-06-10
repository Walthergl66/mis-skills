import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { resolve, join } from "node:path";
import { listSkillDirs, rootDir, skillsDir } from "./lib/skills.mjs";

const args = process.argv.slice(2);
const targetArg = args.find((arg) => !arg.startsWith("--"));
const overwrite = args.includes("--overwrite");
const skipExisting = args.includes("--skip-existing");
const noBackup = args.includes("--no-backup");

if (!targetArg || args.includes("--help") || args.includes("-h")) {
  console.log(`Usage:
  node scripts/install-to-project.mjs <project-path> [--overwrite] [--skip-existing] [--no-backup]

Examples:
  npm run install:project -- ../my-app
  npm run install:project -- C:\\work\\my-app --overwrite
  npm run install:project -- ~/work/my-app --skip-existing
`);
  process.exit(targetArg ? 0 : 1);
}

if (overwrite && skipExisting) {
  console.error("Choose either --overwrite or --skip-existing, not both.");
  process.exit(1);
}

const targetRoot = resolve(process.cwd(), targetArg);
const targetSkillsDir = join(targetRoot, ".agents", "skills");
const backupDir = join(targetRoot, ".agents", "skills.backup");
const skills = listSkillDirs(skillsDir);

if (!existsSync(skillsDir) || skills.length === 0) {
  console.error(`No source skills found in ${skillsDir}`);
  process.exit(1);
}

mkdirSync(targetSkillsDir, { recursive: true });

let copied = 0;
let skipped = 0;
let backedUp = 0;

for (const skill of skills) {
  const destination = join(targetSkillsDir, skill.name);

  if (existsSync(destination)) {
    if (skipExisting) {
      skipped += 1;
      console.log(`Skipped existing ${skill.name}`);
      continue;
    }

    if (overwrite) {
      if (!noBackup) {
        mkdirSync(backupDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        renameSync(destination, join(backupDir, `${skill.name}-${stamp}`));
        backedUp += 1;
      } else {
        rmSync(destination, { recursive: true, force: true });
      }
    } else {
      skipped += 1;
      console.log(`Skipped existing ${skill.name}. Use --overwrite to replace it.`);
      continue;
    }
  }

  cpSync(skill.dir, destination, { recursive: true });
  copied += 1;
  console.log(`Installed ${skill.name}`);
}

console.log("");
console.log(`Source: ${rootDir}`);
console.log(`Target: ${targetSkillsDir}`);
console.log(`Copied: ${copied}`);
console.log(`Skipped: ${skipped}`);
console.log(`Backed up: ${backedUp}`);
