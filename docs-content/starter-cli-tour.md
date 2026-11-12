---
id: starter-cli-tour
title: Tour the cosyte command line
sidebar_label: cli-tour
description: "The cosyte command over a synthetic HL7 v2 message: parse, inspect, validate, convert to a FHIR R4 Bundle and de-identify, each step with its exit code."
---

# Tour the cosyte command line

The `cli-tour` starter walks the `cosyte` command from `@cosyte/cli` over a synthetic HL7 v2 admit
message: parse it to typed JSON, summarize it, validate it, convert it to a FHIR R4 Bundle, and
de-identify it. Each step prints the command it runs, what the CLI printed, and the exit code.

Libraries: [`@cosyte/cli`](https://docs.cosyte.com/cli/), [`@cosyte/hl7`](https://docs.cosyte.com/hl7/),
[`@cosyte/synth`](https://docs.cosyte.com/synth/).

## What it shows

- **`cosyte parse`** detects the format from the content and prints the parsed model as JSON.
- **`cosyte inspect`** prints a structural summary with no field value in it: message type, version,
  segment counts and the warning count. On the converted Bundle it prints the Bundle's type and its
  entries.
- **`cosyte validate`** puts the verdict in the exit code: `0` valid, `1` invalid, `65` unparseable.
- **`cosyte convert --to fhir`** passes the message to `@cosyte/transform` and prints the Bundle on
  stdout, with its findings on stderr as a severity, a code and a locator, never a field value.
- **`cosyte redact`** hands the message to `@cosyte/deid` and prints the de-identified copy on stdout,
  with the value-free manifest on stderr. It refuses rather than under-redacts: when the policy
  blocks a locus, it prints nothing on stdout and exits `1`.

## Run it

From a clone of [cosyte/examples](https://github.com/cosyte/examples), on Node 22 or later, with bash:

```bash
cd examples/cli-tour
npm ci
npm start
```

`npm start` runs `bash tour.sh`, which puts `node_modules/.bin` first on `PATH`, so `cosyte` is the
one `npm ci` installed. The tour writes its files to `out/` and makes no network calls. A non-zero
exit stops the tour with that code, so `npm start` fails when a step fails.

`npm test` runs the tour, checks that every step exited 0, and checks the `inspect` summary, the
validation verdict, the conversion result and the redact manifest. It reads the files the tour wrote
and checks them against the synthetic input. It then adds a visit number (`PV1-19`) to the same
message and checks that `redact` refuses it: exit `1`, nothing on stdout, and the blocked locus named
on stderr without its value.

## Before you build on it

- On the 0.1 line, the default policy of `@cosyte/deid` blocks a visit number (`PV1-19`) and a placer
  or filler order number. Many real ADT messages carry a visit number, so check the exit code of
  `cosyte redact` before you use the copy. To choose a policy yourself, call `@cosyte/deid` from code,
  as the [deid-hl7 starter](./starter-deid-hl7.md) does.
- The de-identified copy is transformed per the library's Safe Harbor policy. It is not certified as
  de-identified.
- The diagnostics and the `inspect` summaries are value-free. The parsed model and the Bundle on
  stdout carry the patient's values, because that output is the data you asked for.
- `validate` calls an HL7 v2 message valid when it parses. It is not a conformance check against a
  profile.

## Expected output

What `npm start` prints, as the starter's README gives it. This section and the next are generated from the starter by `scripts/docs-content.mjs`, and CI fails when they no longer match it.

```text
== The CLI: cosyte from node_modules/.bin
$ cosyte --version
0.1.1
exit 0

== Synthetic input from @cosyte/synth
$ node src/make-fixtures.js out
Wrote out/adt-a01.hl7, a synthetic ADT^A01 from @cosyte/synth (seed 12345):
  MSH|^~\&|COSYTE-SYNTH|SYNTH-FAC|RECEIVER|RECV-FAC|20220305042943||ADT^A01|SYNTH4722901508|P|2.5
  EVN|A01|20220305042943
  PID|1||26068087^^^COSYTE-SYNTH^MR||Quillfeather^Fixtura||19610809|M|||7117 Sample Street^^Synthville^MN^00000||(528) 555-0105||||||969217321
  PV1|1|E|SYNTHWARD^909^01
exit 0

== 1. parse: detect the format and write the message as typed JSON
$ cosyte parse out/adt-a01.hl7 > out/adt-a01.parsed.json
exit 0
The first 27 of 522 lines of out/adt-a01.parsed.json:
{
  "format": "hl7",
  "model": {
    "encodingCharacters": {
      "field": "|",
      "component": "^",
      "repetition": "~",
      "escape": "\\",
      "subcomponent": "&"
    },
    "segments": [
      {
        "name": "MSH",
        "fields": [
          {
            "repetitions": [
              {
                "components": [
                  {
                    "subcomponents": [
                      "|"
                    ]
                  }
                ]
              }
            ],
            "isNull": false

== 2. inspect: a value-free summary of the same message
$ cosyte inspect out/adt-a01.hl7
format:       hl7
message type: ADT^A01
version:      2.5
segments:     4
  EVN: 1
  MSH: 1
  PID: 1
  PV1: 1
warnings:     0
exit 0

== 3. validate: the exit code is the verdict (0 valid, 1 invalid, 65 unparseable)
$ cosyte validate out/adt-a01.hl7
cosyte: validate: hl7 is valid (0 finding(s))
exit 0

== 4. convert: HL7 v2 to a FHIR R4 message Bundle, value-free findings on stderr
$ cosyte convert out/adt-a01.hl7 --to fhir > out/adt-a01.fhir.json
cosyte: convert: warning TRANSFORM_IDENTIFIER_SYSTEM_UNRESOLVED at CX.4 → Identifier.system
cosyte: convert: information TRANSFORM_ELEMENT_DROPPED at PID.13 → Patient.telecom
cosyte: convert: information TRANSFORM_ELEMENT_DROPPED at PV1.3 → Encounter.location
cosyte: convert: information TRANSFORM_REQUIRED_ELEMENT_UNKNOWN at MSH.3 → MessageHeader.source.endpoint
cosyte: convert: warning TRANSFORM_TIMESTAMP_NO_TIMEZONE at TS.1 → dateTime
cosyte: convert: information TRANSFORM_ELEMENT_DROPPED at MSH.7 → Bundle.timestamp
cosyte: convert: information TRANSFORM_SEGMENT_NOT_EMITTED at EVN[1]
cosyte: convert: hl7 → fhir OK (7 finding(s))
exit 0

== 5. inspect: the shape of the converted Bundle
$ cosyte inspect out/adt-a01.fhir.json
format:        fhir
resource type: Bundle
bundle type:   message
entries:       3
  Encounter: 1
  MessageHeader: 1
  Patient: 1
issues:        0
exit 0

== 6. redact: a de-identified copy via @cosyte/deid (exit 1, and no copy, if it blocks a locus)
$ cosyte redact out/adt-a01.hl7 > out/adt-a01.redacted.hl7
cosyte: redact: delegated to @cosyte/deid 0.1.1: Safe-Harbor-transformed per the configured policy
cosyte: redact: DATES generalize MSH-7[0] x1 transformed DEID_RESIDUAL_RETAINED
cosyte: redact: DATES generalize EVN-2[0] x1 transformed DEID_RESIDUAL_RETAINED
cosyte: redact: MRN redact PID-3[0] x1 removed DEID_CATEGORY_REMOVED
cosyte: redact: NAMES redact PID-5 x1 removed DEID_CATEGORY_REMOVED
cosyte: redact: DATES generalize PID-7 x1 transformed DEID_RESIDUAL_RETAINED
cosyte: redact: GEOGRAPHIC generalize PID-11[0] x1 transformed DEID_RESIDUAL_RETAINED
cosyte: redact: PHONE redact PID-13 x1 removed DEID_CATEGORY_REMOVED
cosyte: redact: SSN redact PID-19 x1 removed DEID_CATEGORY_REMOVED
cosyte: redact: hl7: 8 loci acted on (4 transformed, 4 removed, 0 blocked)
cosyte: redact: identifier surrogates are keyed with a per-invocation ephemeral key: consistent within this output, not stable across runs
exit 0
The de-identified message in out/adt-a01.redacted.hl7:
  MSH|^~\&|COSYTE-SYNTH|SYNTH-FAC|RECEIVER|RECV-FAC|2022||ADT^A01|SYNTH4722901508|P|2.5
  EVN|A01|2022
  PID|1||^^^COSYTE-SYNTH^MR||||1961|M|||^^^^000||||||||
  PV1|1|E|SYNTHWARD^909^01
```

## Files

The starter's code, every file of `cli-tour/` as this release holds it, except its README, its lockfile and its tests, which are in the repository: [cli-tour on GitHub](https://github.com/cosyte/examples/tree/main/cli-tour).

### package.json

```json title="cli-tour/package.json"
{
  "name": "cosyte-example-cli-tour",
  "version": "0.0.0",
  "private": true,
  "description": "Walk the Cosyte CLI from @cosyte/cli over a synthetic HL7 v2 message: parse, inspect, validate, convert to FHIR R4 and redact.",
  "license": "MIT",
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "start": "bash tour.sh",
    "test": "node --test test/*.test.js test/integration/*.fast.test.js",
    "test:full": "node --test --experimental-test-coverage --test-coverage-include=test/integration/support.js --test-coverage-exclude=node_modules/** --test-coverage-lines=100 --test-coverage-branches=100 --test-coverage-functions=100 test/*.test.js test/integration/*.test.js"
  },
  "dependencies": {
    "@cosyte/cli": "^0.1.0",
    "@cosyte/hl7": "^0.1.0",
    "@cosyte/synth": "^0.1.0"
  },
  "devDependencies": {
    "@cosyte/ccda": "^0.1.0",
    "@cosyte/fhir": "^0.1.0",
    "@cosyte/x12": "^0.1.0"
  }
}
```

### src/make-fixtures.js

```js title="cli-tour/src/make-fixtures.js"
// @ts-check
// Writes the synthetic input the tour runs the `cosyte` CLI over: `node src/make-fixtures.js <dir>`.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseHL7 } from "@cosyte/hl7";
import { generateAdt } from "@cosyte/synth/hl7";

/** The seed for every generated file. The same seed gives the same bytes on every machine. */
export const SEED = 12345;

/**
 * Build a synthetic ADT^A01 (admit) message. Every name, identifier, date, phone and address comes
 * from @cosyte/synth's synthetic pools.
 *
 * @param {number} seed
 * @returns {string} the HL7 v2 wire text, segments separated by carriage returns
 */
export function syntheticAdmit(seed) {
  return generateAdt({ seed, trigger: "A01" }).toString();
}

/**
 * The patient identifiers in the message's PID segment, read with @cosyte/hl7. The test checks that
 * none of them reaches the CLI's value-free output (its stderr notes and `inspect` summaries).
 *
 * @param {string} wire
 * @returns {string[]}
 */
export function patientIdentifiers(wire) {
  const message = parseHL7(wire);
  const paths = ["PID.3.1", "PID.5.1", "PID.5.2", "PID.7", "PID.11.1", "PID.13", "PID.19"];
  return paths.map((path) => message.get(path) ?? "").filter((value) => value !== "");
}

/**
 * Write the tour's input files into `dir`, creating it if needed.
 *
 * @param {string} dir
 * @returns {{ adt: string }} the path of each file written
 */
export function writeFixtures(dir) {
  mkdirSync(dir, { recursive: true });
  const adt = join(dir, "adt-a01.hl7");
  writeFileSync(adt, syntheticAdmit(SEED));
  return { adt };
}

// Run as a script (not imported): write the files and show what went into them.
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { adt } = writeFixtures(process.argv[2] ?? "out");
  console.log(`Wrote ${adt}, a synthetic ADT^A01 from @cosyte/synth (seed ${SEED}):`);
  for (const segment of syntheticAdmit(SEED).split("\r").filter(Boolean)) console.log(`  ${segment}`);
}
```

### tour.sh

```bash title="cli-tour/tour.sh"
#!/usr/bin/env bash
# A tour of the `cosyte` command from @cosyte/cli over a synthetic HL7 v2 admit message:
# parse, inspect, validate, convert to FHIR R4 and de-identify. Each step prints the command it
# runs, what the CLI printed, and the exit code. Run it with `npm start`, or `bash tour.sh` after
# `npm install`.
set -euo pipefail

cd "$(dirname "$0")"

# `npm start` puts node_modules/.bin on PATH. We do the same so `bash tour.sh` also runs the
# `cosyte` that `npm install` put there, never a global one.
PATH="$PWD/node_modules/.bin:$PATH"
export PATH

OUT="out"
ADT="$OUT/adt-a01.hl7"
PARSED="$OUT/adt-a01.parsed.json"
BUNDLE="$OUT/adt-a01.fhir.json"
REDACTED="$OUT/adt-a01.redacted.hl7"
PREVIEW_LINES=27

# Print a step heading, with a blank line before every heading but the first.
headings=0
heading() {
  if [ "$headings" -gt 0 ]; then echo; fi
  headings=$((headings + 1))
  echo "== $1"
}

# Print a command the way you would type it, run it, then print its exit code. The CLI's stderr
# joins stdout, so its value-free notes appear where a terminal shows them. A non-zero exit stops
# the tour with that code.
run() {
  echo "\$ $*"
  local status=0
  "$@" 2>&1 || status=$?
  echo "exit $status"
  return "$status"
}

# The same, with the command's stdout saved to the file named first. stderr stays on screen.
run_to() {
  local file="$1"
  shift
  echo "\$ $* > $file"
  local status=0
  "$@" 2>&1 >"$file" || status=$?
  echo "exit $status"
  return "$status"
}

heading "The CLI: cosyte from node_modules/.bin"
run cosyte --version

heading "Synthetic input from @cosyte/synth"
run node src/make-fixtures.js "$OUT"

heading "1. parse: detect the format and write the message as typed JSON"
run_to "$PARSED" cosyte parse "$ADT"
echo "The first $PREVIEW_LINES of $(wc -l <"$PARSED" | tr -d ' ') lines of $PARSED:"
head -n "$PREVIEW_LINES" "$PARSED"

heading "2. inspect: a value-free summary of the same message"
run cosyte inspect "$ADT"

heading "3. validate: the exit code is the verdict (0 valid, 1 invalid, 65 unparseable)"
run cosyte validate "$ADT"

heading "4. convert: HL7 v2 to a FHIR R4 message Bundle, value-free findings on stderr"
run_to "$BUNDLE" cosyte convert "$ADT" --to fhir

heading "5. inspect: the shape of the converted Bundle"
run cosyte inspect "$BUNDLE"

heading "6. redact: a de-identified copy via @cosyte/deid (exit 1, and no copy, if it blocks a locus)"
run_to "$REDACTED" cosyte redact "$ADT"
echo "The de-identified message in $REDACTED:"
tr '\r' '\n' <"$REDACTED" | sed -e '/^$/d' -e 's/^/  /'
```
