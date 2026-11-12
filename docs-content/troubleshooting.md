---
id: troubleshooting
title: Troubleshooting
sidebar_label: Troubleshooting
description: "What to do when a starter will not install or run: the Node version, a lockfile out of step, a busy MLLP port, a missing bash, and a check that exits 1."
---

# Troubleshooting

## `npm ci` warns about the engine, or the starter fails with a syntax error

The starters need Node.js 22 or later; each `package.json` says so in `engines`. Check with
`node --version`, and move to Node 22 or 24, the two lines CI tests.

## `npm ci` says the lockfile is out of sync

`npm ci` refuses when `package.json` and `package-lock.json` disagree, which happens after you change
a version range by hand. Rebuild the lockfile as
[Update the libraries in a starter](./update-the-libraries.md) describes, then run `npm test`.

## `npm run server` says it could not listen

```text
Could not listen on 127.0.0.1:2575 (EADDRINUSE). Set PORT to a free port.
```

Another process holds port 2575. Start the listener on another port, and send to that port:

```bash
PORT=2600 npm run server
PORT=2600 npm run send
```

`npm start` is not affected: it lets the OS pick a free port.

## `npm run send` says it could not connect

```text
Could not connect to 127.0.0.1:2575. Start the listener first: npm run server
```

Start `npm run server` in another terminal first, on the same `PORT`. `npm run send` also exits 1
when the answer is not `AA`, or when its `MSA-2` does not match the `MSH-10` it sent.

## `cli-tour` fails before the first step

Its `npm start` runs `bash tour.sh`, so it needs bash on your `PATH`. On Windows, run it from Git
Bash or WSL. Run `npm ci` first: the tour runs the `cosyte` command from `node_modules/.bin`.

## A starter exits 1

Several starters end with a check that exits 1 when it fails, so a pipeline built on them stops:

| Starter | Exits 1 when |
| --- | --- |
| `deid-hl7` | an identifier from the input is found in the output, the manifest or the residual list |
| `dicom-metadata` | an identifying value from the input is found in the written file or the manifest |
| `x12-remittance` | a balance equation does not balance |
| `hl7-to-fhir` | validation reports a fatal issue or an error |
| `hl7-mllp-listener` | a message is not answered `AA` |
| `cli-tour` | a step exits nonzero; the tour stops with that step's code |

On the synthetic data in the repository, none of these fails: CI runs every starter on every pull
request. If one fails after you changed the code or the input, the last lines of its output say
which check failed.

## `cosyte redact` exits 1 and writes nothing

The policy blocked a position it will not de-identify, such as a visit number in `PV1-19`, and
`cosyte redact` refuses rather than write a copy that still holds it. stderr names the blocked
locus with `DEID_LOCUS_BLOCKED`. To choose a policy yourself, call `@cosyte/deid` from code, as the
[deid-hl7 starter](./starter-deid-hl7.md) does.

## Something else

Open an issue on [cosyte/examples](https://github.com/cosyte/examples/issues), with the starter, your
Node version and the output. Leave real patient data out of it.
