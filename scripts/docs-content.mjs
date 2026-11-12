#!/usr/bin/env node
// Writes the generated parts of docs-content/ from the starters, and checks the rest is in place.
//
//   node scripts/docs-content.mjs           write the generated sections, then report what is missing
//   node scripts/docs-content.mjs --check   write nothing, and fail when a generated section is stale
//
// A starter is a top-level folder with a tracked package.json, read from `git ls-files` the way
// starters.yml lists them. For each one, docs-content/starter-<name>.md is written by hand down to
// its "## Expected output" heading; from there to the end of the page is generated:
//
//   * "## Expected output": the first fenced block of the "## Expected output" section of the
//     starter's README, which is what `npm start` prints;
//   * "## Files": every tracked file of the starter but its README, its lockfile, its .gitignore and
//     its tests, package.json first.
//
// What it refuses, with exit 1:
//
//   * a starter with no page, a page with no starter, or a page without its "## What it shows" and
//     "## Run it" headings before "## Expected output";
//   * a README with no "## Expected output" section holding a fenced block;
//   * a starter page that docs-content/sidebars.json does not list, or that the overview
//     (docs-content/intro.md) does not link;
//   * with --check, a generated section that differs from what the starter gives.
//
// Exit 2 when it cannot run at all: no docs-content/ folder, or a root that git does not track.
//
// Zero dependencies, like the starters' own code: Node 22 or later, and git.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** The heading where the generated part of a starter page begins. */
export const GENERATED_FROM = "## Expected output";

/** The heading of the generated list of files. */
export const FILES_HEADING = "## Files";

/** The headings every starter page writes by hand, before the generated part. */
export const WRITTEN_HEADINGS = Object.freeze(["## What it shows", "## Run it"]);

/** A starter's files the Files section leaves out: they are not the starter's code. */
const LEFT_OUT = new Set(["README.md", "package-lock.json", ".gitignore"]);

/** The fence language of a file, by its extension. */
const LANGUAGES = { ".js": "js", ".mjs": "js", ".json": "json", ".sh": "bash", ".md": "md" };

/** Where a starter lives on GitHub, for the link under its Files heading. */
const TREE = "https://github.com/cosyte/examples/tree/main";

/**
 * A file's text, or null when there is no such file. Read once, with no check before it, so nothing
 * can change the file between a check and the read.
 *
 * @param {string} path The file.
 * @returns {string | null} Its text, or null.
 */
export function readIfPresent(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * The starters: each top-level folder with a tracked package.json, sorted.
 *
 * @param {string} root The repository root.
 * @returns {string[]} The starter folder names.
 */
export function listStarters(root) {
  return trackedFiles(root, "*/package.json")
    .map((path) => path.split("/"))
    .filter((parts) => parts.length === 2)
    .map((parts) => parts[0])
    .sort();
}

/**
 * The files git tracks under a pathspec, relative to the root, in path order.
 *
 * @param {string} root The repository root.
 * @param {string} pathspec A git pathspec.
 * @returns {string[]} The paths, with forward slashes.
 */
function trackedFiles(root, pathspec) {
  const out = execFileSync("git", ["ls-files", "-z", "--", pathspec], {
    cwd: root,
    encoding: "utf8",
  });
  return out
    .split("\0")
    .filter((path) => path !== "")
    .sort();
}

/**
 * The files a starter page shows: every tracked file but the README, the lockfile, the .gitignore
 * and the tests, package.json first and the rest in path order.
 *
 * @param {string} root The repository root.
 * @param {string} name The starter.
 * @returns {string[]} Paths relative to the starter folder.
 */
export function starterFiles(root, name) {
  const files = trackedFiles(root, `${name}/`)
    .map((path) => path.slice(name.length + 1))
    .filter((path) => !LEFT_OUT.has(path) && !path.startsWith("test/"));
  return files.sort((a, b) => {
    if (a === "package.json") return -1;
    if (b === "package.json") return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

/**
 * A fence long enough to hold some text: one backtick more than its longest run, three at least.
 *
 * @param {string} text The text the fence holds.
 * @returns {string} The fence.
 */
export function fenceFor(text) {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
}

/**
 * The first fenced block of a README's "## Expected output" section.
 *
 * @param {string} readme The README's text.
 * @returns {string | null} The block's content, or null when the section or its block is missing.
 */
export function expectedOutput(readme) {
  const lines = readme.split(/\r?\n/);
  const start = lines.indexOf(GENERATED_FROM);
  if (start === -1) return null;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^#{1,2} /.test(lines[i])) return null;
    const open = /^(`{3,}|~{3,})/.exec(lines[i]);
    if (open === null) continue;
    const fence = open[1];
    const body = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const close = lines[j].trim();
      if (close.length >= fence.length && close === fence[0].repeat(close.length)) {
        return body.join("\n");
      }
      body.push(lines[j]);
    }
    return null;
  }
  return null;
}

/**
 * The generated part of a starter page: its expected output and its files.
 *
 * @param {string} root The repository root.
 * @param {string} name The starter.
 * @param {string} output What `npm start` prints, from the README.
 * @returns {string} The Markdown, from "## Expected output" to the end of the page.
 */
export function generatedPart(root, name, output) {
  const outputFence = fenceFor(output);
  const lines = [
    GENERATED_FROM,
    "",
    "What `npm start` prints, as the starter's README gives it. This section and the next are " +
      "generated from the starter by `scripts/docs-content.mjs`, and CI fails when they no longer " +
      "match it.",
    "",
    `${outputFence}text`,
    output,
    outputFence,
    "",
    FILES_HEADING,
    "",
    `The starter's code, every file of \`${name}/\` as this release holds it, except its README, its ` +
      `lockfile and its tests, which are in the repository: [${name} on GitHub](${TREE}/${name}).`,
    "",
  ];
  for (const file of starterFiles(root, name)) {
    const content = readFileSync(join(root, name, file), "utf8").replace(/\n+$/, "");
    const fence = fenceFor(content);
    const dot = file.lastIndexOf(".");
    const language = (dot === -1 ? undefined : LANGUAGES[file.slice(dot)]) ?? "text";
    lines.push(`### ${file}`, "", `${fence}${language} title="${name}/${file}"`, content, fence, "");
  }
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

/**
 * Every id a sidebar lists, at any depth.
 *
 * @param {unknown} node A sidebar, or a part of one.
 * @returns {string[]} The ids.
 */
export function sidebarIds(node) {
  if (typeof node === "string") return [node];
  if (Array.isArray(node)) return node.flatMap(sidebarIds);
  if (node !== null && typeof node === "object") {
    if (node.type === "doc" && typeof node.id === "string") return [node.id];
    return sidebarIds(node.items ?? []);
  }
  return [];
}

/**
 * Write or check the generated sections, and report what is missing.
 *
 * @param {{ root: string, check: boolean }} options Where the repository is, and whether to only check.
 * @returns {{ code: 0 | 1 | 2, problems: string[], written: string[] }} The outcome.
 */
export function run({ root, check }) {
  const problems = [];
  const written = [];
  const docs = join(root, "docs-content");
  let entries;
  try {
    entries = readdirSync(docs);
  } catch {
    return { code: 2, problems: ["there is no docs-content/ folder"], written };
  }
  let starters;
  try {
    starters = listStarters(root);
  } catch {
    return { code: 2, problems: [`git cannot list the files of ${root}`], written };
  }
  if (starters.length === 0) problems.push("no starter found (a top-level folder with a tracked package.json)");

  const pages = [];
  for (const name of starters) {
    const id = `starter-${name}`;
    const page = join(docs, `${id}.md`);
    const text = readIfPresent(page);
    if (text === null) {
      problems.push(
        `${name} has no page: write docs-content/${id}.md with the headings ` +
          `${WRITTEN_HEADINGS.join(", ")}, then ${GENERATED_FROM} (the rest is generated), ` +
          "list it in docs-content/sidebars.json and link it from docs-content/intro.md",
      );
      continue;
    }
    pages.push(id);
    const lines = text.split("\n");
    const cut = lines.indexOf(GENERATED_FROM);
    if (cut === -1) {
      problems.push(`docs-content/${id}.md has no '${GENERATED_FROM}' heading, where its generated part begins`);
      continue;
    }
    const handWritten = lines.slice(0, cut);
    for (const heading of WRITTEN_HEADINGS) {
      if (!handWritten.includes(heading)) {
        problems.push(`docs-content/${id}.md has no '${heading}' heading before '${GENERATED_FROM}'`);
      }
    }
    const readme = readIfPresent(join(root, name, "README.md"));
    const output = readme === null ? null : expectedOutput(readme);
    if (output === null) {
      problems.push(`${name}/README.md has no '${GENERATED_FROM}' section holding a fenced block`);
      continue;
    }
    const want = `${handWritten.join("\n").replace(/\n+$/, "")}\n\n${generatedPart(root, name, output)}`;
    if (want === text) continue;
    if (check) {
      problems.push(
        `docs-content/${id}.md no longer matches ${name}/: run node scripts/docs-content.mjs and commit what it writes`,
      );
    } else {
      writeFileSync(page, want);
      written.push(`docs-content/${id}.md`);
    }
  }

  for (const file of entries) {
    const match = /^starter-(.+)\.md$/.exec(file);
    if (match !== null && !starters.includes(match[1])) {
      problems.push(`docs-content/${file} has no starter: there is no tracked ${match[1]}/package.json`);
    }
  }

  const sidebar = readIfPresent(join(docs, "sidebars.json"));
  let listed = new Set();
  if (sidebar !== null) {
    try {
      listed = new Set(sidebarIds(JSON.parse(sidebar).docs ?? []));
    } catch {
      problems.push("docs-content/sidebars.json is not JSON");
    }
  } else {
    problems.push("there is no docs-content/sidebars.json");
  }
  const intro = readIfPresent(join(docs, "intro.md"));
  if (intro === null) problems.push("there is no docs-content/intro.md, the overview");
  for (const id of pages) {
    if (!listed.has(id)) problems.push(`docs-content/sidebars.json does not list ${id}`);
    if (intro !== null && !intro.includes(`](./${id}.md`)) {
      problems.push(`docs-content/intro.md does not link ./${id}.md: the overview routes to every starter`);
    }
  }
  return { code: problems.length > 0 ? 1 : 0, problems, written };
}

function main(argv) {
  let root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  let check = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--check") check = true;
    else if (argv[i] === "--root" && i + 1 < argv.length) root = resolve(argv[(i += 1)]);
    else {
      console.error(`docs-content.mjs: unknown argument ${argv[i]}`);
      return 2;
    }
  }
  const { code, problems, written } = run({ root, check });
  for (const path of written) console.log(`docs-content.mjs: wrote ${path}`);
  for (const message of problems) console.error(`docs-content.mjs: ${message}`);
  if (code === 0) console.log("docs-content.mjs: docs-content/ matches the starters.");
  return code;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
