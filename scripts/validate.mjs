import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { listSkillDirs, parseSkillMarkdown, readRegistry, rootDir, skillsDir } from "./lib/skills.mjs";

const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const semverPattern = /^\d+\.\d+\.\d+$/;
const allowedFrontmatterKeys = new Set([
  "name",
  "description",
  "license",
  "metadata",
  "compatibility",
  "keywords",
  "allowed-tools",
]);
const localLinkPattern = /\]\((?!https?:|mailto:|#)([^)]+?\.(?:md|json))\)/g;
const catalogPath = join(skillsDir, "skill-router", "references", "catalog.md");
const errors = [];
const seenNames = new Map();
const seenDescriptions = new Map();

if (!existsSync(skillsDir)) {
  errors.push(`Missing canonical skills directory: ${skillsDir}`);
}

const entries = listSkillDirs();
const installedNames = new Set(entries.map((entry) => entry.name));

for (const entry of entries) {
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

  validateFrontmatter(entry, parsed, errors);

  for (const file of listMarkdownFiles(entry.dir)) {
    for (const link of localLinks(readFileSync(file, "utf8"))) {
      const target = join(file, "..", link);
      if (!existsSync(target)) {
        errors.push(`${entry.name}: broken local link "${link}" in ${relative(entry.dir, file)}.`);
      }
    }
  }

  validateEvals(entry.name, entry.dir, errors);
}

validateCatalog(installedNames, errors);
validateRegistry(errors);

function validateCatalog(installed, list) {
  if (!existsSync(catalogPath)) {
    list.push(`Missing skill catalog: ${relative(rootDir, catalogPath)}.`);
    return;
  }
  const sections = [];
  const catalogNames = new Map();
  let current = null;
  for (const line of readFileSync(catalogPath, "utf8").split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+?)\s+\((\d+)\)\s*$/);
    if (heading) {
      current = { title: heading[1], declared: Number(heading[2]), rows: 0 };
      sections.push(current);
      continue;
    }
    if (/^##\s+/.test(line)) {
      current = null;
      continue;
    }
    const row = line.match(/^\|\s*`([a-z0-9-]+)`\s*\|/);
    if (row && current) {
      const name = row[1];
      current.rows += 1;
      const previous = catalogNames.get(name);
      if (previous) list.push(`catalog: skill "${name}" is listed in both ${previous} and ${current.title}.`);
      else catalogNames.set(name, current.title);
    }
  }
  for (const section of sections) {
    if (section.rows !== section.declared) {
      list.push(`catalog: section "${section.title}" declares ${section.declared} skills but lists ${section.rows}.`);
    }
  }
  for (const name of catalogNames.keys()) {
    if (!installed.has(name)) list.push(`catalog: "${name}" has no installed skill folder.`);
  }
  for (const name of installed) {
    if (!catalogNames.has(name)) list.push(`catalog: installed skill "${name}" is missing from the catalog.`);
  }
}

function validateRegistry(list) {
  const registry = readRegistry();
  for (const name of registry.excludeSkills || []) {
    if (existsSync(join(skillsDir, name))) {
      list.push(`registry: excluded skill "${name}" is still installed in .agents/skills.`);
    }
  }
}

function validateFrontmatter(entry, parsed, list) {
  if (!parsed.hasFrontmatter) return;

  if (!parsed.body.endsWith("\n")) {
    list.push(`${entry.name}: SKILL.md must end with a newline.`);
  }

  for (const key of Object.keys(parsed.meta)) {
    if (!allowedFrontmatterKeys.has(key)) {
      list.push(`${entry.name}: unknown frontmatter key "${key}".`);
    }
  }

  if (parsed.license !== "MIT") {
    list.push(`${entry.name}: frontmatter license must be "MIT".`);
  }

  const metadata = parsed.metadata;
  if (!metadata || typeof metadata !== "object") {
    list.push(`${entry.name}: frontmatter must include a metadata block with author and version.`);
  } else {
    if (!metadata.author || typeof metadata.author !== "string") {
      list.push(`${entry.name}: metadata.author must be a non-empty string.`);
    }
    if (!semverPattern.test(metadata.version || "")) {
      list.push(`${entry.name}: metadata.version must be semver (x.y.z).`);
    }
    for (const key of Object.keys(metadata)) {
      if (key !== "author" && key !== "version") {
        list.push(`${entry.name}: unknown metadata key "${key}".`);
      }
    }
  }
}

function listMarkdownFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) listMarkdownFiles(full, out);
    else if (name.endsWith(".md")) out.push(full);
  }
  return out;
}

function localLinks(body) {
  const links = new Set();
  let match;
  localLinkPattern.lastIndex = 0;
  while ((match = localLinkPattern.exec(body)) !== null) {
    const target = match[1].split("#")[0].trim().split(/\s+/)[0].replace(/^\.\//, "");
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

console.log(`Validated ${entries.length} skills in .agents/skills.`);
