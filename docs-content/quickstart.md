---
id: quickstart
title: Quickstart
sidebar_label: Quickstart
description: "Run the deid-hl7 starter: de-identify a synthetic HL7 v2 message, read the value-free manifest, then run the test that checks it."
---

# Quickstart

This runs one starter, `deid-hl7`, from a fresh clone: it de-identifies a synthetic HL7 v2 admit
message and prints what it did. Every other starter runs the same way.

## 1. Clone and install

On Node.js 22 or later:

```bash
git clone https://github.com/cosyte/examples.git
cd examples/deid-hl7
npm ci
```

## 2. Run it

```bash
npm start
```

It prints how many fields of each segment hold a value before and after, the precision of each date
before and after, the manifest of what the policy changed (a locus, a category, a transform and a
code per row, never a value), the positions it passed
through without a rule, and a last check: every identifier read from the input, searched for in the
output, the manifest and the residual list. Its three `Found in` lines each end in `0`, and the
process exits 0. If an identifier were found, it would exit 1. The whole output is on the
[deid-hl7 page](./starter-deid-hl7.md#expected-output).

## 3. Run its test

```bash
npm test
```

The test runs the starter again and asserts its key output, then de-identifies the message in
process and checks that no identifier from the input `PID` segment survives anywhere. It also runs
the starter's fast integration tests, which chain the libraries through their public APIs.

## 4. Read the code

The starter is two files: `src/deid.js` and `src/main.js`. Both are on the
[deid-hl7 page](./starter-deid-hl7.md#files), with what each call does.

## Next

- [Pick another starter](./intro.md#pick-a-starter-by-what-you-want-to-build) by what you want to
  build.
- [Start a project from a starter](./start-a-project-from-a-starter.md): copy one out and make it
  yours.
- [Run the full tests](./run-the-full-tests.md): the seed sweeps and the coverage check.
