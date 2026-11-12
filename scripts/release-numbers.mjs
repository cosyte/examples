#!/usr/bin/env node
// Fills the "## Current numbers" section of the two quality pages, for the release being built.
//
//   node scripts/release-numbers.mjs --logs DIR --commit SHA --node VERSION --runner NAME
//
// The release workflow runs `npm test` in every starter, writing each run's output to
// DIR/<starter>.log, then runs this, then scripts/pack-docs.sh, so the numbers reach
// docs-content.tar.gz and are never committed: in the repository each section holds only the
// placeholder. It changes only the working tree.
//
// testing-and-quality.md gets what that run measured: for each starter, the tests that ran, passed,
// failed, were skipped and are marked todo, read from the summary node's test runner prints last.
// performance.md says the starters are not measured, and why.

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { listStarters, readIfPresent } from "./docs-content.mjs";

/** The heading of the section each quality page's numbers go in. */
export const HEADING = "## Current numbers";

/** The counts node's test runner prints at the end of a run, in the order the table shows them. */
export const COUNTS = Object.freeze(["tests", "pass", "fail", "skipped", "todo"]);

/**
 * The summary counts of one `node --test` run, from its output. The TAP reporter prints
 * `# tests 12`, the spec reporter `ℹ tests 12`; a nested run prints its own, indented, so only
 * unindented lines count, and the last of each wins.
 *
 * @param {string} log The run's output.
 * @returns {Record<string, number> | null} The counts, or null when the log has no summary.
 */
export function readSummary(log) {
  const counts = {};
  for (const match of log.matchAll(/^(?:# |ℹ )(tests|pass|fail|cancelled|skipped|todo) (\d+)$/gm)) {
    counts[match[1]] = Number(match[2]);
  }
  return COUNTS.every((key) => key in counts) ? counts : null;
}

/**
 * Replace the body of a page's "Current numbers" section, up to the next heading of level one or two.
 *
 * @param {string} text The page.
 * @param {string} body The new section body.
 * @returns {string} The page with the section replaced.
 */
export function replaceSection(text, body) {
  const marker = `\n${HEADING}\n`;
  const at = text.indexOf(marker);
  if (at === -1) throw new Error(`the page has no '${HEADING}' section`);
  const start = at + marker.length;
  const next = /^#{1,2} /m.exec(text.slice(start));
  const rest = next === null ? "" : text.slice(start + next.index);
  return `${text.slice(0, start)}\n${body.replace(/\n+$/, "")}\n${rest === "" ? "" : `\n${rest}`}`;
}

/**
 * The body of the testing page's section.
 *
 * @param {{ starters: string[], logs: Map<string, string | null>, commit: string, node: string, runner: string, date: string }} run
 * @returns {string} Markdown.
 */
export function testingBody({ starters, logs, commit, node, runner, date }) {
  const lines = [
    `Measured by the release's own run of \`npm test\` in every starter, at commit \`${commit.slice(0, 12)}\`, ` +
      `on ${date}, on Node.js ${node}, on the GitHub-hosted runner \`${runner}\`. Each starter was ` +
      "installed from its lockfile first. What each run covers is under [What we check](#what-we-check); " +
      "the seed sweeps of `npm run test:full` are not part of it.",
    "",
    "| Starter | Tests | Passed | Failed | Skipped | Todo |",
    "| --- | --- | --- | --- | --- | --- |",
  ];
  const total = Object.fromEntries(COUNTS.map((key) => [key, 0]));
  const missing = [];
  for (const name of starters) {
    const log = logs.get(name);
    const counts = log == null ? null : readSummary(log);
    if (counts === null) {
      missing.push(name);
      lines.push(`| [${name}](./starter-${name}.md) | not measured for this release | | | | |`);
      continue;
    }
    for (const key of COUNTS) total[key] += counts[key];
    lines.push(`| [${name}](./starter-${name}.md) | ${COUNTS.map((key) => counts[key]).join(" | ")} |`);
  }
  lines.push(`| All ${starters.length} starters | ${COUNTS.map((key) => total[key]).join(" | ")} |`);
  if (missing.length > 0) {
    lines.push(
      "",
      `Not measured for this release: ${missing.join(", ")}. The release found no test summary in ` +
        "the run's output, so the totals leave these starters out.",
    );
  }
  lines.push(
    "",
    "A test marked todo names a library defect we reported upstream; it runs, and does not fail the " +
      "suite until the library is fixed.",
  );
  return lines.join("\n");
}

/**
 * The body of the performance page's section.
 *
 * @param {{ commit: string, date: string }} run
 * @returns {string} Markdown.
 */
export function performanceBody({ commit, date }) {
  return (
    `Not measured for this release (commit \`${commit.slice(0, 12)}\`, ${date}): the starters are ` +
    "demonstrations that each handle one synthetic input, and have no benchmark. The libraries' own " +
    "Performance pages carry the measured numbers, with their method."
  );
}

function main(argv) {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!["--logs", "--commit", "--node", "--runner"].includes(key) || i + 1 >= argv.length) {
      console.error(`release-numbers.mjs: usage: --logs DIR --commit SHA --node VERSION --runner NAME`);
      return 2;
    }
    args[key.slice(2)] = argv[i + 1];
  }
  for (const key of ["logs", "commit", "node", "runner"]) {
    if (!(key in args)) {
      console.error(`release-numbers.mjs: --${key} is required`);
      return 2;
    }
  }
  const starters = listStarters(root);
  const logs = new Map(
    starters.map((name) => [name, readIfPresent(join(args.logs, `${name}.log`))]),
  );
  const date = new Date().toISOString().slice(0, 10);
  const run = { starters, logs, commit: args.commit, node: args.node, runner: args.runner, date };
  const pages = [
    ["testing-and-quality.md", testingBody(run)],
    ["performance.md", performanceBody(run)],
  ];
  for (const [file, body] of pages) {
    const path = join(root, "docs-content", file);
    writeFileSync(path, replaceSection(readFileSync(path, "utf8"), body));
    console.log(`release-numbers.mjs: filled the Current numbers of docs-content/${file}`);
  }
  return 0;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
