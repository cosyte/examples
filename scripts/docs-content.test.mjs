// Tests for scripts/docs-content.mjs, the generator and check of the starter pages.
//
//   node --test scripts/*.test.mjs
//
// Each test builds a small repository of its own in a temporary folder (git init, then git add of
// the files it wrote), so the starters are listed from tracked files as they are here. The last test
// runs the check over this repository itself.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { expectedOutput, fenceFor, listStarters, readIfPresent, run, starterFiles } from "./docs-content.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const README = [
  "# demo",
  "",
  "## Run it",
  "",
  "```bash",
  "npm start",
  "```",
  "",
  "## Expected output",
  "",
  "```text",
  "Synthetic message from ZZTEST (seed 1):",
  "  checked: 3",
  "```",
  "",
  "A note after the block.",
  "",
  "## Test",
  "",
].join("\n");

const PAGE_HEAD = [
  "---",
  "id: starter-demo",
  "title: The demo starter",
  "sidebar_label: demo",
  'description: "A demo."',
  "---",
  "",
  "# The demo starter",
  "",
  "## What it shows",
  "",
  "Something.",
  "",
  "## Run it",
  "",
  "Run it.",
  "",
].join("\n");

const SIDEBAR = JSON.stringify({
  docs: [
    "intro",
    { type: "category", label: "Reference", items: [{ type: "category", label: "Starters", items: ["starter-demo"] }] },
  ],
});

/** A repository with one starter, `demo`, and the docs-content files given. */
function fixture(t, { page = `${PAGE_HEAD}## Expected output\n`, sidebar = SIDEBAR, intro = "[demo](./starter-demo.md)\n", extra = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "docs-content-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = {
    "demo/package.json": '{ "name": "demo", "scripts": { "start": "node src/main.js" } }\n',
    "demo/package-lock.json": "{}\n",
    "demo/README.md": README,
    "demo/.gitignore": "out/\n",
    "demo/src/main.js": 'console.log("checked: 3");\n',
    "demo/src/a.js": "export const a = 1;\n",
    "demo/test/demo.test.js": "// a test\n",
    "docs-content/intro.md": intro,
    "docs-content/sidebars.json": sidebar,
    ...(page === null ? {} : { "docs-content/starter-demo.md": page }),
    ...extra,
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["add", "--", ...Object.keys(files)], { cwd: root });
  return root;
}

test("a starter is a top-level folder with a tracked package.json", (t) => {
  const root = fixture(t, { extra: { "demo/nested/package.json": "{}\n" } });
  writeFileSync(join(root, "untracked-package.json"), "{}\n");
  mkdirSync(join(root, "untracked"));
  writeFileSync(join(root, "untracked", "package.json"), "{}\n");
  assert.deepEqual(listStarters(root), ["demo"]);
});

test("a starter with no page fails the check, naming the page to write", (t) => {
  const root = fixture(t, { page: null });
  const { code, problems } = run({ root, check: true });
  assert.equal(code, 1);
  assert.ok(
    problems.some((p) => p.startsWith("demo has no page: write docs-content/starter-demo.md")),
    problems.join("\n"),
  );
});

test("the generator writes the expected output and the files, and the check then passes", (t) => {
  const root = fixture(t);
  const first = run({ root, check: false });
  assert.deepEqual(first.written, ["docs-content/starter-demo.md"]);
  assert.equal(first.code, 0, first.problems.join("\n"));
  const page = readFileSync(join(root, "docs-content/starter-demo.md"), "utf8");
  assert.ok(page.startsWith(PAGE_HEAD), "the hand-written part is kept as it was");
  assert.match(page, /## Expected output\n[\s\S]*```text\nSynthetic message from ZZTEST \(seed 1\):\n {2}checked: 3\n```\n/);
  assert.ok(!page.includes("A note after the block."), "only the fenced block is taken from the README");
  assert.match(page, /### package\.json\n\n```json title="demo\/package\.json"\n/);
  assert.match(page, /### src\/main\.js\n\n```js title="demo\/src\/main\.js"\nconsole\.log\("checked: 3"\);\n```\n/);
  const second = run({ root, check: true });
  assert.equal(second.code, 0, second.problems.join("\n"));
  assert.deepEqual(second.written, []);
});

test("the check fails on a stale page and writes nothing", (t) => {
  const root = fixture(t);
  run({ root, check: false });
  writeFileSync(join(root, "demo/src/main.js"), 'console.log("checked: 4");\n');
  const before = readFileSync(join(root, "docs-content/starter-demo.md"), "utf8");
  const { code, problems, written } = run({ root, check: true });
  assert.equal(code, 1);
  assert.deepEqual(written, []);
  assert.ok(problems.some((p) => p.includes("starter-demo.md no longer matches demo/")), problems.join("\n"));
  assert.equal(readFileSync(join(root, "docs-content/starter-demo.md"), "utf8"), before);
});

test("the files leave out the README, the lockfile, the .gitignore and the tests, package.json first", (t) => {
  const root = fixture(t);
  assert.deepEqual(starterFiles(root, "demo"), ["package.json", "src/a.js", "src/main.js"]);
});

test("a page needs its written headings, and the README its expected output", (t) => {
  const root = fixture(t, {
    page: PAGE_HEAD.replace("## Run it\n", "## Running\n") + "## Expected output\n",
    extra: { "demo/README.md": "# demo\n\n## Run it\n" },
  });
  const { code, problems } = run({ root, check: false });
  assert.equal(code, 1);
  assert.ok(problems.includes("docs-content/starter-demo.md has no '## Run it' heading before '## Expected output'"), problems.join("\n"));
  assert.ok(problems.includes("demo/README.md has no '## Expected output' section holding a fenced block"), problems.join("\n"));
});

test("a page with no generated part says where it should begin", (t) => {
  const root = fixture(t, { page: PAGE_HEAD });
  const { code, problems } = run({ root, check: false });
  assert.equal(code, 1);
  assert.ok(problems.some((p) => p.includes("has no '## Expected output' heading")), problems.join("\n"));
});

test("every starter page is in the sidebar and linked from the overview", (t) => {
  const root = fixture(t, { sidebar: JSON.stringify({ docs: ["intro"] }), intro: "No links.\n" });
  run({ root, check: false });
  const { code, problems } = run({ root, check: true });
  assert.equal(code, 1);
  assert.ok(problems.includes("docs-content/sidebars.json does not list starter-demo"), problems.join("\n"));
  assert.ok(problems.some((p) => p.startsWith("docs-content/intro.md does not link ./starter-demo.md")), problems.join("\n"));
});

test("a page whose starter is gone fails the check", (t) => {
  const root = fixture(t, { extra: { "docs-content/starter-gone.md": "---\n---\n" } });
  run({ root, check: false });
  const { code, problems } = run({ root, check: true });
  assert.equal(code, 1);
  assert.ok(problems.some((p) => p.startsWith("docs-content/starter-gone.md has no starter")), problems.join("\n"));
});

test("no docs-content folder is exit 2", (t) => {
  const root = mkdtempSync(join(tmpdir(), "docs-content-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.equal(run({ root, check: true }).code, 2);
});

test("the expected output is the first fenced block of its section, and nothing past the next heading", () => {
  assert.equal(expectedOutput("## Expected output\n\n````text\na ``` b\n````\n\n```text\nsecond\n```\n"), "a ``` b");
  assert.equal(expectedOutput("## Expected output\n\nNo block.\n\n## Test\n\n```text\nlater\n```\n"), null);
  assert.equal(expectedOutput("## Other\n\n```text\nx\n```\n"), null);
  assert.equal(expectedOutput("## Expected output\n\n```text\nnever closed\n"), null);
});

test("a missing file reads as null, and any other read error is thrown", (t) => {
  const root = mkdtempSync(join(tmpdir(), "docs-content-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "a.md"), "text\n");
  assert.equal(readIfPresent(join(root, "a.md")), "text\n");
  assert.equal(readIfPresent(join(root, "missing.md")), null);
  assert.throws(() => readIfPresent(root), { code: "EISDIR" });
});

test("a fence is longer than any backtick run it holds", () => {
  assert.equal(fenceFor("plain"), "```");
  assert.equal(fenceFor("a ``` b ```` c"), "`````");
});

test("this repository's docs-content matches its starters", () => {
  const { code, problems } = run({ root: REPO, check: true });
  assert.equal(code, 0, problems.join("\n"));
});
