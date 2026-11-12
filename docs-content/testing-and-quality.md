---
id: testing-and-quality
title: Testing and quality
sidebar_label: Testing and quality
description: "How the starters are tested: every starter on Node 22 and 24 on every pull request, the full integration suite nightly, and what none of it can catch."
---

# Testing and quality

The starters are tested as a reader runs them: each one installed from its lockfile, run, and its
output asserted. Nothing is mocked; the libraries under test are the published packages each
starter's lockfile names.

## What we check

- **Every starter, on every pull request and every push to `main`**, on Node 22 and 24: `npm ci`,
  then `npm test`, which runs the starter, asserts its key output, and runs its fast integration
  tests. One check, `All starters`, stands for the whole matrix, and a new starter is tested from the
  pull request that adds it. The same run repeats nightly on `main`.
- **The full integration suite**, `npm run test:full` in every starter on Node 22 and 24, nightly
  on `main` and on a pull request that changes an integration test. It adds the seed sweeps and
  fails unless each starter's test helpers are fully covered. See
  [Run the full tests](./run-the-full-tests.md).
- **A library's release, before it publishes.** The full suite can be called with a library's
  package built for release: every starter that uses that library installs the new build in its
  place, and the suite runs against it. A separate workflow proves the swap happens, with a marked
  build the registry does not have.
- **These pages.** `scripts/docs-content.mjs --check` fails when a starter has no page, when a
  page's expected output or files no longer match its starter, or when a page is missing from the
  sidebar or the overview; the docs-content structure check reads the sidebar and every page's front
  matter.
- **The rest of the repository.** No em or en dash in any tracked file, pull request title, body or
  commit message; actionlint over every workflow; CodeQL; and OpenSSF Scorecard.

## What they cannot catch

- **Your data.** Every input is synthetic. A message from a real sender may carry a segment, a code
  or a quirk no synthetic input has.
- **A pattern that is unsafe but passes.** A test proves what a starter does, not that it is the
  right thing to copy. Review is what keeps a starter from logging a value or binding a wider
  address.
- **Clinical sense.** Synthetic records are built field by field, so a test passes on a record no
  clinician would believe.
- **Speed.** No starter is benchmarked; see [Performance](./performance.md).

## Run the checks yourself

From a clone, on Node 22 or later, in any starter:

```bash
npm ci
npm test
npm run test:full
```

And for these pages, from the repository root:

```bash
node scripts/docs-content.mjs --check
node --test scripts/*.test.mjs
```

## Current numbers

The numbers for this section are measured on `main` at each release and filled in when the release
is built. They are never typed by hand.
