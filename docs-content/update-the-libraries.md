---
id: update-the-libraries
title: Update the libraries in a starter
sidebar_label: Update the libraries
description: "Move a starter to a new release of a Cosyte library: change the range, rebuild the lockfile from scratch, check what resolved, and run the tests."
---

# Update the libraries in a starter

Each starter sets its `@cosyte/*` versions in its own `package.json` and commits its
`package-lock.json`. These steps move it to a new release, in this repository or in your own copy.

## 1. Change the range

In the starter's `package.json`, set each `@cosyte/*` package you are moving to its new range, for
example `"@cosyte/hl7": "^0.2.0"`. Move the packages that depend on each other together: a starter
that uses `@cosyte/transform` also lists `@cosyte/hl7` and `@cosyte/fhir`, its peer dependencies.

## 2. Rebuild the lockfile from scratch

```bash
rm -rf node_modules package-lock.json
npm install
```

An install over the old lockfile can keep an older release that every range still accepts: one of
our starters kept an old `@cosyte/fhir` that way. Rebuilding from nothing resolves every package
again.

## 3. Check what resolved

```bash
npm ls --all | grep @cosyte/
```

Every `@cosyte` package in the tree, the ones the libraries pull in included, should be on the line
you moved to.

## 4. Run the tests

```bash
npm test
npm run test:full
```

If a test fails, read what changed in the library's release notes before you change the test: a
starter's test asserts what the library does, so a failure may be a change you need to know about.

## Related

- [Run the full tests](./run-the-full-tests.md): what `npm run test:full` adds.
- [Troubleshooting](./troubleshooting.md), when `npm ci` refuses the lockfile.
