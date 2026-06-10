import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const rootDir = fileURLToPath(new URL("../../", import.meta.url));
export const skillsDir = join(rootDir, ".agents", "skills");
export const registryPath = join(rootDir, "registry", "skills.json");

export function readRegistry() {
  return JSON.parse(readFileSync(registryPath, "utf8"));
}

export function listSkillDirs(baseDir = skillsDir) {
  if (!existsSync(baseDir)) return [];
  return readdirSync(baseDir)
    .map((name) => ({ name, dir: join(baseDir, name) }))
    .filter((entry) => statSync(entry.dir).isDirectory())
    .filter((entry) => existsSync(join(entry.dir, "SKILL.md")))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function parseSkillMarkdown(filePath) {
  const body = readFileSync(filePath, "utf8");
  const match = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const frontmatter = match ? match[1] : "";
  const meta = {};
  const lines = frontmatter.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const item = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!item) continue;

    const key = item[1];
    const rawValue = item[2].trim();

    if (rawValue === ">" || rawValue === "|") {
      const collected = [];
      while (index + 1 < lines.length && /^\s+/.test(lines[index + 1])) {
        index += 1;
        collected.push(lines[index].trim());
      }
      meta[key] = collected.join(rawValue === ">" ? " " : "\n").replace(/\s+/g, " ").trim();
    } else {
      meta[key] = rawValue.replace(/^["']|["']$/g, "").trim();
    }
  }
  return {
    name: meta.name || "",
    description: meta.description || "",
    body
  };
}

export function skillSummaries() {
  return listSkillDirs().map((entry) => {
    const parsed = parseSkillMarkdown(join(entry.dir, "SKILL.md"));
    return {
      folder: entry.name,
      name: parsed.name || entry.name,
      description: parsed.description || "No description found.",
      path: `.agents/skills/${entry.name}/SKILL.md`
    };
  });
}

export function toTitle(value) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ascii(value) {
  return value
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/≈/g, "~")
    .replace(/\s+/g, " ")
    .trim();
}
