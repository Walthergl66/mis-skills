import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listSkillDirs, parseSkillMarkdown, skillsDir } from "./lib/skills.mjs";

const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const localLinkPattern = /\]\((?!https?:|mailto:|#)([^)]+?\.(?:md|json))\)/g;
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
  if (!parsed.hasFrontmatter) {
    errors.push(`${entry.name}: SKILL.md must start with a YAML frontmatter block.`);
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

  for (const link of localLinks(parsed.body)) {
    if (link.startsWith("..")) continue;
    const target = join(entry.dir, link);
    if (!existsSync(target)) {
      errors.push(`${entry.name}: broken local link "${link}".`);
    }
  }

  validateEvals(entry.name, entry.dir, errors);
}

function localLinks(body) {
  const links = new Set();
  let match;
  localLinkPattern.lastIndex = 0;
  while ((match = localLinkPattern.exec(body)) !== null) {
    const target = match[1].split("#")[0].replace(/^\.\//, "");
    if (target) links.add(target);
  }
  return links;
}

function validateEvals(name, dir, list) {
  const evalPath = join(dir, "evals", "evals.json");
  if (!existsSync(evalPath)) return;

  let evals;
  try {
    evals = JSON.parse(readFileSync(evalPath, "utf8"));
  } catch (error) {
    list.push(`${name}: evals.json is not valid JSON (${error.message}).`);
    return;
  }

  const declaredName = evals.skill || evals.skill_name;
  if (declaredName && declaredName !== name) {
    list.push(`${name}: evals.json name "${declaredName}" must match the folder name.`);
  }

  const items = Array.isArray(evals.cases) ? evals.cases : Array.isArray(evals.evals) ? evals.evals : [];
  if (dedupe(items).length === 0) {
    list.push(`${name}: evals.json must contain a non-empty "cases" or "evals" array.`);
    return;
  }
  for (const item of items) {
    const label = item && item.id ? item.id : "<missing id>";
    const expectations = Array.isArray(item && item.expectations) ? item.expectations : item && item.assertions;
    if (!item || !item.id || !item.prompt || !Array.isArray(expectations) || expectations.length === 0) {
      list.push(`${name}: eval case ${label} needs id, prompt, and a non-empty expectations or assertions array.`);
    }
  }
}

function dedupe(items) {
  return items.filter((item, index, all) => all.indexOf(item) === index);
}

if (errors.length > 0) {
  console.error("Validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Validated ${listSkillDirs().length} skills in .agents/skills.`);
