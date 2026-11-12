---
id: starter-deid-hl7
title: De-identify an HL7 v2 message
sidebar_label: deid-hl7
description: "An HL7 v2 admit message run through the Safe Harbor policy, with the value-free manifest of what changed and the positions it left unexamined."
---

# De-identify an HL7 v2 message

The `deid-hl7` starter runs a synthetic HL7 v2 admit message through the Safe Harbor policy of
`@cosyte/deid` and prints the value-free manifest: which identifier categories it acted on, at which
locus and how, without a single value. It also lists the positions the policy passed through without
a rule, so you can see what it did not examine. It prints no value from the message, before or after:
segment names, how many fields of each hold a value, and the precision of each date.

Libraries: [`@cosyte/deid`](https://docs.cosyte.com/deid/),
[`@cosyte/hl7`](https://docs.cosyte.com/hl7/), [`@cosyte/synth`](https://docs.cosyte.com/synth/).

## What it shows

- **Structural de-identification.** `@cosyte/deid` locates identifiers in the parsed model from
  `@cosyte/hl7` (PID-5 is the patient name because the standard says so), not by pattern matching
  the text.
- **The pass.** `deidentifyHl7(message)` from `@cosyte/deid/hl7` applies the built-in Safe Harbor
  policy and returns a new message, the manifest, and `unexaminedResiduals`: every value-bearing
  position it handed through without a rule, by locus. The input message is never changed.
- **No key.** The Safe Harbor policy removes the medical record number rather than derive a surrogate
  from it. For surrogates that stay consistent across documents, the Limited Data Set profile with a
  key is the option, and it does not claim Safe Harbor.
- **A check you can keep.** `src/main.js` searches the output, the manifest and the residual list for
  every identifier read from the input, and exits 1 if one is found.
- **Reading without printing.** To show what a field holds, `src/main.js` reads the date of birth
  before and after into variables, with the synthetic values in comments, and prints only their
  precision.

## Run it

From a clone of [cosyte/examples](https://github.com/cosyte/examples), on Node 22 or later:

```bash
cd examples/deid-hl7
npm ci
npm start
```

The Safe Harbor policy uses no key, so every run prints the same output.

`npm test` runs the starter and checks the manifest rows for the medical record number, name, date
of birth, phone, national identifier and the two timestamps, and that the output holds no identifier
from the input and no segment of the message. It de-identifies the message again in
process and checks that no identifier read from the input `PID` segment appears in the output, the
manifest or the residual list, and that each of the three dates keeps its year and nothing finer.

## Before you build on it

- The output is transformed per the configured Safe Harbor policy. It is not certified as
  de-identified, and `@cosyte/deid` renders no Expert Determination.
- Free text in `OBX-5` and `NTE-3` and any Z-segment are blocked by default, not scrubbed.
- Neither the manifest nor the residual list says whether a passed-through value identifies someone:
  here that covers the message control ID (`MSH-10`) and the patient location (`PV1-3`). Review the
  residual list against the positions your own policy must cover.

## Expected output

What `npm start` prints, as the starter's README gives it. This section and the next are generated from the starter by `scripts/docs-content.mjs`, and CI fails when they no longer match it.

```text
Synthetic ADT^A01 from @cosyte/synth (seed 12345), 4 segments.

Fields holding a value, per segment, before and after (Safe Harbor policy):
  MSH  10 -> 10
  EVN   2 -> 2
  PID   8 -> 5
  PV1   3 -> 3

Date precision, before and after:
  PID-7  day -> year
  MSH-7  time -> year
  EVN-2  time -> year

Manifest (value-free: locus, category, transform, disposition, code):
  MSH-7[0]     DATES        generalize   transformed  DEID_RESIDUAL_RETAINED
  EVN-2[0]     DATES        generalize   transformed  DEID_RESIDUAL_RETAINED
  PID-3[0]     MRN          redact       removed      DEID_CATEGORY_REMOVED
  PID-5        NAMES        redact       removed      DEID_CATEGORY_REMOVED
  PID-7        DATES        generalize   transformed  DEID_RESIDUAL_RETAINED
  PID-11[0]    GEOGRAPHIC   generalize   transformed  DEID_RESIDUAL_RETAINED
  PID-13       PHONE        redact       removed      DEID_CATEGORY_REMOVED
  PID-19       SSN          redact       removed      DEID_CATEGORY_REMOVED

Unexamined residuals (value-free: 19 positions passed through without a rule):
  MSH-1 MSH-2 MSH-3 MSH-4 MSH-5 MSH-6 MSH-9.1 MSH-9.2 MSH-10 MSH-11 MSH-12
  EVN-1
  PID-1 PID-8
  PV1-1 PV1-2 PV1-3.1 PV1-3.2 PV1-3.3

Input identifiers checked: 7
Found in the de-identified message: 0
Found in the manifest: 0
Found in the residual list: 0
```

## Files

The starter's code, every file of `deid-hl7/` as this release holds it, except its README, its lockfile and its tests, which are in the repository: [deid-hl7 on GitHub](https://github.com/cosyte/examples/tree/main/deid-hl7).

### package.json

```json title="deid-hl7/package.json"
{
  "name": "cosyte-example-deid-hl7",
  "version": "0.0.0",
  "private": true,
  "description": "De-identify a synthetic HL7 v2 ADT^A01 with @cosyte/deid and print the value-free manifest.",
  "license": "MIT",
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "start": "node src/main.js",
    "test": "node --test test/*.test.js test/integration/*.fast.test.js",
    "test:full": "node --test --experimental-test-coverage --test-coverage-include=test/integration/support.js --test-coverage-exclude=node_modules/** --test-coverage-lines=100 --test-coverage-branches=100 --test-coverage-functions=100 test/*.test.js test/integration/*.test.js"
  },
  "dependencies": {
    "@cosyte/deid": "^0.1.0",
    "@cosyte/hl7": "^0.1.0",
    "@cosyte/synth": "^0.1.0"
  }
}
```

### src/deid.js

```js title="deid-hl7/src/deid.js"
// @ts-check
import { deidentifyHl7 } from "@cosyte/deid/hl7";
import { parseHL7 } from "@cosyte/hl7";
import { generateAdt } from "@cosyte/synth/hl7";

/**
 * Build a synthetic ADT^A01 (admit) message. The same seed gives the same bytes on every machine,
 * and every name, identifier, date, phone and address comes from @cosyte/synth's synthetic pools.
 *
 * @param {number} seed
 * @returns {string} the HL7 v2 wire text, segments separated by carriage returns
 */
export function syntheticAdmit(seed) {
  return generateAdt({ seed, trigger: "A01" }).toString();
}

/**
 * The patient identifiers in PID that Safe Harbor must not let through, read from the parsed input.
 * The check after de-identification looks for each of these values in the output.
 *
 * @param {import("@cosyte/hl7").Hl7Message} message
 * @returns {string[]}
 */
export function patientIdentifiers(message) {
  const paths = ["PID.3.1", "PID.5.1", "PID.5.2", "PID.7", "PID.11.1", "PID.13", "PID.19"];
  return paths.map((path) => message.get(path)).filter((value) => typeof value === "string" && value !== "");
}

/**
 * De-identify an HL7 v2 message under the built-in Safe Harbor policy.
 *
 * The policy uses no keyed transform, so it needs no key: a surrogate computed from the medical
 * record number would be derived from the patient's own identifier, which Safe Harbor does not
 * permit, so the policy removes the number instead. Besides the manifest of what it acted on, the
 * pass returns `unexaminedResiduals`: each value-bearing position it handed through without a rule,
 * by locus and count, never by value.
 *
 * @param {string} wire
 */
export function deidentifyMessage(wire) {
  const input = parseHL7(wire);
  const { document, manifest, unexaminedResiduals } = deidentifyHl7(input);
  return { input, output: document, manifest, residuals: unexaminedResiduals };
}
```

### src/main.js

```js title="deid-hl7/src/main.js"
// @ts-check
import { deidentifyMessage, patientIdentifiers, syntheticAdmit } from "./deid.js";

const SEED = 12345;

const wire = syntheticAdmit(SEED);
const { input, output, manifest, residuals } = deidentifyMessage(wire);

// Nothing below prints a value from the message, synthetic or not: an example that logs a patient's
// name teaches a pipeline to log one. It prints segment names, counts, date precision and codes.
/** @param {string} text */
const segmentsOf = (text) => text.split("\r").filter(Boolean);
/** @param {string} segment The fields of a segment that hold anything: a count, never a value. */
const filled = (segment) => segment.split("|").slice(1).filter((field) => field !== "").length;

const before = segmentsOf(wire);
const after = segmentsOf(output.toString());
console.log(`Synthetic ADT^A01 from @cosyte/synth (seed ${SEED}), ${before.length} segments.`);
console.log("\nFields holding a value, per segment, before and after (Safe Harbor policy):");
before.forEach((segment, i) => {
  console.log(`  ${segment.slice(0, 3)}  ${String(filled(segment)).padStart(2)} -> ${filled(after[i] ?? "")}`);
});

// To see what a field holds, read it into a variable or assert on it. The values in these comments
// are synthetic, from @cosyte/synth.
const birthDateIn = input.get("PID.7"); // "19610809", synthetic
const birthDateOut = output.get("PID.7"); // "1961", synthetic
/** @param {string | undefined} value An HL7 v2 date or timestamp, named by its precision only. */
const precision = (value) => {
  if (!value) return "empty";
  if (value.length <= 4) return "year";
  if (value.length <= 6) return "month";
  return value.length <= 8 ? "day" : "time";
};
console.log("\nDate precision, before and after:");
console.log(`  PID-7  ${precision(birthDateIn)} -> ${precision(birthDateOut)}`);
for (const path of ["MSH.7", "EVN.2"]) {
  console.log(`  ${path.replace(".", "-")}  ${precision(input.get(path))} -> ${precision(output.get(path))}`);
}

console.log("\nManifest (value-free: locus, category, transform, disposition, code):");
for (const entry of manifest) {
  const row = [entry.locus, entry.category, entry.transform, entry.disposition, entry.code];
  console.log(`  ${row.map((cell) => cell.padEnd(12)).join(" ").trimEnd()}`);
}

// The positions the policy handed through without a rule, one line per segment. Nothing here was
// examined, so review the list against the positions your own policy must cover.
const positions = residuals.reduce((total, residual) => total + residual.count, 0);
console.log(`\nUnexamined residuals (value-free: ${positions} positions passed through without a rule):`);
/** @type {Map<string, string[]>} */
const bySegment = new Map();
for (const { locus, count } of residuals) {
  const segment = locus.split("-")[0];
  bySegment.set(segment, [...(bySegment.get(segment) ?? []), count > 1 ? `${locus} (${count})` : locus]);
}
for (const loci of bySegment.values()) console.log(`  ${loci.join(" ")}`);

// A check you can keep in your own pipeline: no input identifier survives in the output, and the
// manifest and the residual list name categories and loci but never a value.
const outputText = output.toString();
const identifiers = patientIdentifiers(input);
const leaked = identifiers.filter((value) => outputText.includes(value));
const inManifest = identifiers.filter((value) => JSON.stringify(manifest).includes(value));
const inResiduals = identifiers.filter((value) => JSON.stringify(residuals).includes(value));

console.log(`\nInput identifiers checked: ${identifiers.length}`);
console.log(`Found in the de-identified message: ${leaked.length}`);
console.log(`Found in the manifest: ${inManifest.length}`);
console.log(`Found in the residual list: ${inResiduals.length}`);

if (leaked.length > 0 || inManifest.length > 0 || inResiduals.length > 0) process.exitCode = 1;
```
