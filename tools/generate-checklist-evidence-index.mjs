#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checklistPath = "docs/39-structural-frontage-execution-checklist.md";
const outputPath = "docs/42-structural-frontage-checked-row-evidence-index.md";
const checklist = readFileSync(join(repoRoot, checklistPath), "utf8");
const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));

function git(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trimEnd();
}

function parseRows(source) {
  const lines = source.split(/\r?\n/);
  const headings = [];
  const rows = [];

  for (let index = 0; index < lines.length; index += 1) {
    const heading = lines[index].match(/^(#{2,6})\s+(.+)$/);
    if (heading) {
      const depth = heading[1].length;
      headings[depth] = heading[2].trim();
      headings.length = depth + 1;
      continue;
    }

    const checkbox = lines[index].match(/^- \[x\]\s+(.+)$/i);
    if (!checkbox) continue;

    const requirementParts = [checkbox[1].trim()];
    for (let continuation = index + 1; continuation < lines.length; continuation += 1) {
      const line = lines[continuation];
      if (!/^\s{2,}\S/.test(line)) break;
      if (/^\s+(?:Evidence|Commit(?:s)? or files|Proof):/i.test(line)) break;
      requirementParts.push(line.trim());
    }

    const section = headings.filter(Boolean).join(" / ");
    const requirement = requirementParts.join(" ").replace(/\s+/g, " ");
    const semanticKey = `${section}\n${requirement.toLowerCase()}`;
    rows.push({
      line: index + 1,
      requirement,
      section,
      key: createHash("sha256").update(semanticKey).digest("hex").slice(0, 12),
    });
  }

  return rows;
}

function parseBlame(source) {
  const result = new Map();
  const lines = source.split(/\r?\n/);
  let hash = "";
  let finalLine = 0;
  for (const line of lines) {
    const header = line.match(/^([0-9a-f]{40})\s+\d+\s+(\d+)(?:\s+\d+)?$/);
    if (header) {
      hash = header[1];
      finalLine = Number(header[2]);
    } else if (line.startsWith("\t")) {
      result.set(finalLine, hash);
      finalLine += 1;
    }
  }
  return result;
}

function addedChecklistLines(hash) {
  const patch = git(["show", "--format=", "--unified=0", hash, "--", checklistPath]);
  return patch
    .split(/\r?\n/)
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));
}

function commandSourceFiles(command) {
  const files = new Set();
  for (const match of command.matchAll(/(?:^|\s)(tools\/[\w./-]+\.(?:[cm]?js|ts))/g)) {
    files.add(match[1]);
  }
  for (const match of command.matchAll(/(?:^|\s)\.tmp\/sim-tests\/(tools\/[\w./-]+)\.js/g)) {
    const typescriptPath = `${match[1]}.ts`;
    if (existsSync(join(repoRoot, typescriptPath))) files.add(typescriptPath);
  }
  return [...files];
}

const trackedFiles = git(["ls-files"]).split(/\r?\n/).filter(Boolean);
const filesByBasename = new Map();
for (const file of trackedFiles) {
  const basename = file.split("/").at(-1);
  const existing = filesByBasename.get(basename) ?? [];
  existing.push(file);
  filesByBasename.set(basename, existing);
}
const scenarioSource = readFileSync(join(repoRoot, "src/sim/cold-start-scenarios.ts"), "utf8");

function mentionedRunners(text) {
  const result = [];
  for (const [name, command] of Object.entries(packageJson.scripts)) {
    const sourceAliases = commandSourceFiles(command).flatMap((file) => {
      const basename = file.split("/").at(-1).replace(/\.[^.]+$/, "");
      return [basename, basename.replace(/-tests$/, "")];
    });
    const aliases = [name, ...sourceAliases].filter((alias) => alias.length >= 5);
    if (aliases.some((alias) => new RegExp(`(?:npm\\s+run\\s+|\\b)${escapeRegExp(alias)}\\b`).test(text))) {
      result.push(name);
    }
  }
  return [...new Set(result)].sort();
}

function extractProof(hash, changedFiles) {
  const addedLines = addedChecklistLines(hash);
  const addedText = addedLines.join("\n");
  const runners = mentionedRunners(addedText);
  const runnerFiles = [...new Set(runners.flatMap((name) => commandSourceFiles(packageJson.scripts[name])))].sort();
  const commitRefs = [...new Set(
    [...addedText.matchAll(/\b[0-9a-f]{7,40}\b/g)]
      .map((match) => match[0])
      .filter((candidate) => !hash.startsWith(candidate) && !candidate.startsWith(hash)),
  )].sort();
  const pathRefs = [...new Set(
    [...addedText.matchAll(/(?:^|[`'(\s])((?:src|tools|public|test|docs)\/[\w@+.,()' -/]+\.(?:ts|tsx|js|mjs|cjs|json|png|webp|svg|html|md))/gm)]
      .map((match) => match[1].trim()),
  )].sort();
  for (const match of addedText.matchAll(/`([\w@+.,()' -]+\.[a-z0-9]+)`/gi)) {
    const candidates = filesByBasename.get(match[1]) ?? [];
    if (candidates.length === 1) pathRefs.push(candidates[0]);
  }
  if (addedText.includes("system-flow-map.html")) pathRefs.push("system-flow-map.html");
  const scenarioCandidates = [
    ...[...addedText.matchAll(/(?:\?scenario=|scenario [`']?)([\w-]+)/gi)].map((match) => match[1]),
    ...[...addedText.matchAll(/`([\w-]+)`/g)].map((match) => match[1]),
  ];
  const scenarios = [...new Set(scenarioCandidates.filter((name) => {
    const quoted = new RegExp(`["']${escapeRegExp(name)}["']\\s*:`);
    return quoted.test(scenarioSource);
  }))].sort();
  const hasEvidenceBlock = addedLines.some((line) => /^\s*(?:[-*]\s+)?(?:Evidence|Commit(?:s)? or files|Proof|Documentation|Focused checks|Visual\/playtest evidence):/i.test(line))
    || addedLines.some((line) => /^\d{4}-\d{2}-\d{2}\s+·/.test(line))
    || addedLines.some((line) => /^#{2,6} .*\b\d{4}-\d{2}-\d{2}\b/.test(line));

  const nonDocFiles = changedFiles.filter((file) => !file.startsWith("docs/"));
  const resolvedFiles = [...new Set([...nonDocFiles, ...runnerFiles, ...pathRefs])].sort();
  return { runners, commitRefs, resolvedFiles, scenarios, hasEvidenceBlock, addedText };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compactPaths(paths) {
  const exact = [];
  const groups = new Map();
  const groupingRoots = [
    "public/assets/",
    "tools/sprites/archive/",
    "tools/sprites/curated/",
    "tools/screenshots/",
    "test-results/",
  ];
  for (const path of paths) {
    const root = groupingRoots.find((candidate) => path.startsWith(candidate));
    if (root) groups.set(root, (groups.get(root) ?? 0) + 1);
    else exact.push(path);
  }
  return [
    ...exact,
    ...[...groups.entries()].map(([root, count]) => `${root}** (${count} files)`),
  ];
}

function markdown(value) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

const rows = parseRows(checklist);
const blame = parseBlame(git(["blame", "--line-porcelain", "--", checklistPath]));
const duplicateKeys = new Set();
const observedKeys = new Set();
for (const row of rows) {
  if (observedKeys.has(row.key)) duplicateKeys.add(row.key);
  observedKeys.add(row.key);
}

const commitCache = new Map();
function commitRecord(hash) {
  if (commitCache.has(hash)) return commitCache.get(hash);
  const [shortHash, ...subjectParts] = git(["show", "-s", "--format=%h%x09%s", hash]).split("\t");
  const changedFiles = git(["diff-tree", "--no-commit-id", "--name-only", "-r", hash])
    .split(/\r?\n/)
    .filter(Boolean);
  const proof = extractProof(hash, changedFiles);
  const record = {
    hash,
    shortHash,
    subject: subjectParts.join("\t"),
    changedFiles,
    proof,
    rows: [],
  };
  commitCache.set(hash, record);
  return record;
}

const missing = [];
for (const row of rows) {
  const hash = blame.get(row.line);
  if (!hash || /^0+$/.test(hash)) {
    missing.push({ ...row, reason: "no committed blame owner" });
    continue;
  }
  const commit = commitRecord(hash);
  const nonDocFiles = commit.changedFiles.filter((file) => !file.startsWith("docs/"));
  const hasDocsResolution = commit.proof.hasEvidenceBlock
    && (commit.proof.runners.length > 0
      || commit.proof.commitRefs.length > 0
      || commit.proof.resolvedFiles.length > 0
      || commit.proof.scenarios.length > 0);
  if (nonDocFiles.length === 0 && !hasDocsResolution) {
    missing.push({ ...row, reason: `docs-only ${commit.shortHash} has no concrete added evidence block` });
    continue;
  }
  commit.rows.push(row);
}

const duplicateRows = rows.filter((row) => duplicateKeys.has(row.key));
const mappedCount = rows.length - missing.length;
const checklistDigest = createHash("sha256").update(checklist).digest("hex");
const head = git(["rev-parse", "--short", "HEAD"]);
const groups = [...commitCache.values()]
  .filter((commit) => commit.rows.length > 0)
  .sort((left, right) => left.rows[0].line - right.rows[0].line);

const output = [];
output.push("# Structural Frontage Checked-Row Evidence Index", "");
output.push(
  `Generated by \`node tools/generate-checklist-evidence-index.mjs\` from HEAD \`${head}\` and checklist SHA-256 \`${checklistDigest}\`.`,
  "",
  "This is a provenance index for checked rows in `docs/39-structural-frontage-execution-checklist.md`. It maps each current checked requirement to the commit that closed or last edited its checkbox. Implementation-bearing commits list their non-document changes. Documentation-only reconciliation commits must contain an added evidence block that resolves to a repository file, a package runner, a scenario, or another commit.",
  "",
  "This index proves traceability, not behavioral correctness. A later failing test or contradictory playtest still requires the affected checklist claim to be reopened.",
  "",
  "## Totals",
  "",
  `- Checked requirements: **${rows.length}**`,
  `- Mapped requirements: **${mappedCount}**`,
  `- Missing mappings: **${missing.length}**`,
  `- Duplicate semantic mappings: **${duplicateRows.length}**`,
  `- Closure commits: **${groups.length}**`,
  "",
  "## Grouped Evidence",
  "",
  "| Closure commit | Kind | Checked requirements | Implementation evidence | Proof resolution |",
  "| --- | --- | --- | --- | --- |",
);

for (const commit of groups) {
  const nonDocFiles = commit.changedFiles.filter((file) => !file.startsWith("docs/"));
  const kind = nonDocFiles.length > 0 ? "implementation" : "evidence reconciliation";
  const requirements = commit.rows
    .map((row) => `L${row.line} · ${markdown(row.section)} · ${markdown(row.requirement)}`)
    .join("<br>");
  const files = compactPaths(nonDocFiles.length > 0 ? nonDocFiles : commit.proof.resolvedFiles);
  const implementationEvidence = files.length > 0
    ? files.map((file) => `\`${markdown(file)}\``).join("<br>")
    : "—";
  const proofParts = [];
  if (commit.proof.commitRefs.length > 0) proofParts.push(`commits ${commit.proof.commitRefs.map((ref) => `\`${ref}\``).join(", ")}`);
  if (commit.proof.runners.length > 0) proofParts.push(`runners ${commit.proof.runners.map((runner) => `\`${runner}\``).join(", ")}`);
  if (commit.proof.scenarios.length > 0) proofParts.push(`scenarios ${commit.proof.scenarios.map((scenario) => `\`${scenario}\``).join(", ")}`);
  if (proofParts.length === 0) proofParts.push("implementation-bearing closure commit");
  output.push(`| \`${commit.shortHash}\` ${markdown(commit.subject)} | ${kind} | ${requirements} | ${implementationEvidence} | ${proofParts.join("<br>")} |`);
}

if (missing.length > 0) {
  output.push("", "## Missing Mappings", "");
  for (const row of missing) output.push(`- L${row.line} · ${row.section} · ${row.requirement} — ${row.reason}`);
}
if (duplicateRows.length > 0) {
  output.push("", "## Duplicate Semantic Mappings", "");
  for (const row of duplicateRows) output.push(`- ${row.key} · L${row.line} · ${row.section} · ${row.requirement}`);
}

writeFileSync(join(repoRoot, outputPath), `${output.join("\n")}\n`);
console.log(`checked=${rows.length} mapped=${mappedCount} missing=${missing.length} duplicate=${duplicateRows.length} commits=${groups.length}`);

if (missing.length > 0 || duplicateRows.length > 0) process.exitCode = 1;
