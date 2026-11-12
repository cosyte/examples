// Tests for scripts/release-numbers.mjs, which fills the quality pages' "Current numbers" at release.
//
//   node --test scripts/*.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { performanceBody, readSummary, replaceSection, testingBody } from "./release-numbers.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const TAP = ["TAP version 13", "# Subtest: a", "ok 1 - a", "1..1", "# tests 7", "# suites 1", "# pass 6", "# fail 0", "# cancelled 0", "# skipped 0", "# todo 1", "# duration_ms 12.5", ""].join("\n");
const SPEC = ["✔ a (1ms)", "ℹ tests 3", "ℹ suites 0", "ℹ pass 3", "ℹ fail 0", "ℹ cancelled 0", "ℹ skipped 0", "ℹ todo 0", "ℹ duration_ms 40", ""].join("\n");

test("the summary is read from the TAP and the spec reporters alike", () => {
  assert.equal(readSummary(TAP).tests, 7);
  assert.equal(readSummary(TAP).pass, 6);
  assert.equal(readSummary(TAP).todo, 1);
  assert.equal(readSummary(SPEC).tests, 3);
  assert.equal(readSummary(SPEC).pass, 3);
});

test("an indented summary from a nested run does not count, and a log with no summary is null", () => {
  assert.equal(readSummary(`  # tests 99\n${TAP}`).tests, 7);
  assert.equal(readSummary("npm ERR! code ELIFECYCLE\n"), null);
  assert.equal(readSummary("# tests 3\n# pass 3\n"), null);
});

test("the section is replaced up to the next heading, and the rest of the page is kept", () => {
  const page = "# T\n\n## Current numbers\n\nThe placeholder.\n\n### Kept inside\n\nx\n\n## After\n\nKept.\n";
  assert.equal(replaceSection(page, "New.\n"), "# T\n\n## Current numbers\n\nNew.\n\n## After\n\nKept.\n");
  assert.equal(replaceSection("# T\n\n## Current numbers\n\nOld.\n", "New."), "# T\n\n## Current numbers\n\nNew.\n");
  assert.throws(() => replaceSection("# T\n", "x"), /no '## Current numbers' section/);
});

test("the testing table has a row per starter and a total, and names what was not measured", () => {
  const body = testingBody({
    starters: ["alpha", "beta", "gamma"],
    logs: new Map([["alpha", TAP], ["beta", SPEC], ["gamma", null]]),
    commit: "0123456789abcdef0123",
    node: "24.1.0",
    runner: "ubuntu-latest",
    date: "2026-11-12",
  });
  assert.match(body, /at commit `0123456789ab`, on 2026-11-12, on Node\.js 24\.1\.0, on the GitHub-hosted runner `ubuntu-latest`/);
  assert.match(body, /^\| \[alpha\]\(\.\/starter-alpha\.md\) \| 7 \| 6 \| 0 \| 0 \| 1 \|$/m);
  assert.match(body, /^\| \[beta\]\(\.\/starter-beta\.md\) \| 3 \| 3 \| 0 \| 0 \| 0 \|$/m);
  assert.match(body, /^\| \[gamma\]\(\.\/starter-gamma\.md\) \| not measured for this release \|/m);
  assert.match(body, /^\| All 3 starters \| 10 \| 9 \| 0 \| 0 \| 1 \|$/m);
  assert.match(body, /Not measured for this release: gamma\./);
});

test("the performance section says why nothing is measured", () => {
  const body = performanceBody({ commit: "0123456789abcdef", date: "2026-11-12" });
  assert.match(body, /^Not measured for this release \(commit `0123456789ab`, 2026-11-12\)/);
});

test("both quality pages carry the section the release fills", () => {
  for (const file of ["testing-and-quality.md", "performance.md"]) {
    const page = readFileSync(join(REPO, "docs-content", file), "utf8");
    assert.doesNotThrow(() => replaceSection(page, "x"), file);
  }
});
