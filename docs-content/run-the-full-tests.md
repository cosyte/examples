---
id: run-the-full-tests
title: Run the full tests
sidebar_label: Run the full tests
description: "Run a starter's whole test suite: its own tests, the fast and full integration tests with their seed sweeps, and the coverage check on its helpers."
---

# Run the full tests

Every starter has two test commands. `npm test` is the quick one; `npm run test:full` runs
everything.

## Run them

From the starter's folder, after `npm ci`:

```bash
npm test           # the starter's own tests and the fast integration tests
npm run test:full  # every test, the seed sweeps included, with the coverage check
```

## What each one runs

- **The starter's own tests**, `test/*.test.js`, in both. They run the starter and assert its
  key output, then check the libraries' results against the synthetic input.
- **The fast integration tests**, `test/integration/*.fast.test.js`, in both. They chain the
  libraries through their public APIs on a few synthetic inputs: for example, every HL7 v2 message
  kind `@cosyte/synth` generates crossing a real MLLP link, or a Bundle de-identified and read back.
- **The full integration tests**, `test/integration/*.full.test.js`, in `test:full` only. They run
  the same checks over many more synthetic inputs: 300 seeds in `x12-eligibility`, for example.
- **The coverage check**, in `test:full` only: it fails unless the helpers in
  `test/integration/support.js` are fully covered, lines, branches and functions.

The tests use Node's own test runner, `node --test`, and need no other tool. They call the libraries'
public APIs only, on synthetic data.

## A test marked todo

A test marked `todo` names a defect we found in a library and reported upstream. It runs, and its
failure does not fail the suite; it passes once the library is fixed. We never work around a library
defect in a test.

## Related

- [Testing and quality](./testing-and-quality.md): what CI runs, and when.
