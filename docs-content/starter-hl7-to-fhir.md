---
id: starter-hl7-to-fhir
title: Convert an HL7 v2 admit to a FHIR R4 Bundle
sidebar_label: hl7-to-fhir
description: "An ADT^A01 converted to a FHIR R4 message Bundle of MessageHeader, Patient and Encounter, with the transform's diagnostics and each resource validated."
---

# Convert an HL7 v2 admit to a FHIR R4 Bundle

The `hl7-to-fhir` starter converts a synthetic HL7 v2 admit message (ADT^A01) into a FHIR R4 message
Bundle, then validates the Bundle and every resource in it. It prints no value that identifies the
patient: for the Patient, how many of each element the transform wrote, the identifier's type and
system, and the precision of the birth date.

Libraries: [`@cosyte/transform`](https://docs.cosyte.com/transform/),
[`@cosyte/fhir`](https://docs.cosyte.com/fhir/), [`@cosyte/hl7`](https://docs.cosyte.com/hl7/),
[`@cosyte/synth`](https://docs.cosyte.com/synth/).

## What it shows

- **The conversion.** `toFhir(message, options)` from `@cosyte/transform` builds a message `Bundle`:
  a `MessageHeader` from `MSH`, a `Patient` from `PID` and an `Encounter` from `PV1`, grounded on the
  maps of the HL7 Version 2 to FHIR implementation guide.
- **The two options that matter.** `namingSystem` says which identifier system the assigning
  authority in `PID-3` stands for; without it the transform keeps the MRN, leaves
  `identifier.system` out and raises a warning. `generateId` numbers the `urn:uuid:` fullUrls so the
  output is the same on every run; leave it out in production and the transform uses
  `crypto.randomUUID`.
- **Value-free diagnostics.** Each diagnostic is a severity, a stable code, a v2 location and, where
  one applies, a FHIR path. `MSH-7` carries no UTC offset, so the transform leaves
  `Bundle.timestamp` out rather than guess one; pass `assumeTimezoneOffsetMinutes` if you know your
  sender's offset.
- **Validation.** `validateResource` from `@cosyte/fhir` validates the Bundle, then each entry on its
  own, in strict mode with the starter-kit profiles, whose Patient profile requires
  `identifier.system` and `identifier.value`.
- **Reading without printing.** `src/main.js` reads the family name, the record number and the birth
  date into variables, with their synthetic values in comments, and prints counts, codes and the
  date's precision.

## Run it

From a clone of [cosyte/examples](https://github.com/cosyte/examples), on Node 22 or later:

```bash
cd examples/hl7-to-fhir
npm ci
npm start
```

`@cosyte/hl7` and `@cosyte/fhir` are peer dependencies of `@cosyte/transform`, so `package.json`
lists them beside it.

`npm test` runs the starter and checks the Patient lines and the validation total, and that the
output holds no value from `PID` and no segment of the message. For four seeds
that cover patient classes E, O and I and both sexes, it converts the admit in process and checks
the Bundle against the parsed input: the Patient's name, identifier, gender, birth date and address
come from `PID`, the Encounter's class comes from `PV1-2`, its subject is the Patient entry, and
`@cosyte/fhir` reports no errors. It also checks that no value from the message appears in the
diagnostics.

## Before you build on it

- On the 0.1 line, `@cosyte/fhir` has no structural schema for `Bundle`, `MessageHeader` or
  `Encounter`: it checks their base elements and the safety rules and reports `RESOURCE_NOT_MODELED`.
  Zero errors here is not a full FHIR conformance verdict.
- `PID-13` (phone) and `PV1-3` (location) are dropped with a diagnostic. `PID-19` (SSN) is dropped
  without one on the 0.1 line of `@cosyte/transform`.
- US Core profiles are not bundled with `@cosyte/fhir`. To validate against them, load their
  StructureDefinitions and pass them as `profiles`.

## Expected output

What `npm start` prints, as the starter's README gives it. This section and the next are generated from the starter by `scripts/docs-content.mjs`, and CI fails when they no longer match it.

```text
Synthetic ADT^A01 from @cosyte/synth (seed 12345), segments MSH EVN PID PV1

FHIR R4 Bundle from @cosyte/transform (type message, 3 entries):
  MessageHeader  urn:uuid:00000000-0000-4000-8000-000000000003
  Patient        urn:uuid:00000000-0000-4000-8000-000000000001
  Encounter      urn:uuid:00000000-0000-4000-8000-000000000002

Patient (from PID):
  elements    name 1, identifier 1, telecom 0, address 1
  family      present
  MRN         8 characters
  identifier  type MR, system https://example.org/fhir/sid/synthetic-mrn
  birthDate   precision day

Encounter (from PV1):
  class       EMER (emergency)
  status      in-progress
  subject     urn:uuid:00000000-0000-4000-8000-000000000001 (the Patient entry)

Transform diagnostics (severity, code, v2 location, FHIR path):
  information  TRANSFORM_ELEMENT_DROPPED           PID.13  Patient.telecom
  information  TRANSFORM_ELEMENT_DROPPED           PID.19  Patient.identifier
  information  TRANSFORM_ELEMENT_DROPPED           PV1.3   Encounter.location
  information  TRANSFORM_REQUIRED_ELEMENT_UNKNOWN  MSH.3   MessageHeader.source.endpoint
  warning      TRANSFORM_TIMESTAMP_NO_TIMEZONE     TS.1    dateTime
  information  TRANSFORM_ELEMENT_DROPPED           MSH.7   Bundle.timestamp
  information  TRANSFORM_SEGMENT_NOT_EMITTED       EVN[1]

Validation with @cosyte/fhir (strict mode, starter-kit profiles):
  Bundle         errors 0, warnings 0, information 1 (RESOURCE_NOT_MODELED)
  MessageHeader  errors 0, warnings 0, information 1 (RESOURCE_NOT_MODELED)
  Patient        errors 0, warnings 0, information 0
  Encounter      errors 0, warnings 0, information 0
  Total          0 fatal, 0 errors, 0 warnings, 2 information
```

## Files

The starter's code, every file of `hl7-to-fhir/` as this release holds it, except its README, its lockfile and its tests, which are in the repository: [hl7-to-fhir on GitHub](https://github.com/cosyte/examples/tree/main/hl7-to-fhir).

### package.json

```json title="hl7-to-fhir/package.json"
{
  "name": "cosyte-example-hl7-to-fhir",
  "version": "0.0.0",
  "private": true,
  "description": "Convert a synthetic HL7 v2 ADT^A01 to a FHIR R4 Bundle with @cosyte/transform and validate it with @cosyte/fhir.",
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
    "@cosyte/fhir": "^0.1.16",
    "@cosyte/hl7": "^0.1.13",
    "@cosyte/synth": "^0.1.10",
    "@cosyte/transform": "^0.2.4"
  },
  "devDependencies": {
    "@cosyte/deid": "^0.2.13",
    "@cosyte/mllp": "^0.1.13",
    "@cosyte/terminology": "^0.1.0"
  }
}
```

### src/convert.js

```js title="hl7-to-fhir/src/convert.js"
// @ts-check
import {
  isComplex,
  isList,
  isPrimitive,
  resolvePath,
  resourceType,
  STARTER_PROFILES,
  validateResource,
} from "@cosyte/fhir";
import { parseHL7 } from "@cosyte/hl7";
import { generateAdt } from "@cosyte/synth/hl7";
import { createNamingSystem, toFhir } from "@cosyte/transform";

/** @typedef {import("@cosyte/fhir").FhirComplex} FhirComplex */
/** @typedef {import("@cosyte/fhir").FhirNode} FhirNode */
/** @typedef {import("@cosyte/fhir").ValidationIssue} ValidationIssue */

/**
 * The identifier system for MRNs issued under the synthetic assigning authority COSYTE-SYNTH.
 * The transform never derives a system URI from a bare namespace, so you map each authority your
 * feed uses to a URI you control. The example.org domain marks this one as fictional.
 */
export const MRN_SYSTEM = "https://example.org/fhir/sid/synthetic-mrn";

/**
 * Build a synthetic ADT^A01 (admit) message. The same seed gives the same bytes on every machine,
 * and every name, identifier, date and address comes from @cosyte/synth's synthetic pools.
 *
 * @param {number} seed
 * @returns {string} the HL7 v2 wire text, segments separated by carriage returns
 */
export function syntheticAdmit(seed) {
  return generateAdt({ seed, trigger: "A01" }).toString();
}

/**
 * Parse an HL7 v2 message and convert it to a FHIR R4 message Bundle.
 *
 * @param {string} wire
 */
export function convertToFhir(wire) {
  const message = parseHL7(wire);
  let next = 0;
  const { bundle, issues } = toFhir(message, {
    namingSystem: createNamingSystem({ authorities: { "COSYTE-SYNTH": MRN_SYSTEM } }),
    // Numbered entry ids keep the output identical from run to run. Leave generateId out in
    // production: the transform then mints each fullUrl with crypto.randomUUID.
    generateId: () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`,
  });
  return { message, bundle, issues };
}

/**
 * The nodes an element path selects, in document order.
 *
 * `resolvePath` flattens the repeating elements it walks through, but on the @cosyte/fhir 0.1 line
 * a repeating element named by the last segment (`entry`, `name.given`) comes back as one list node
 * rather than its items, so we flatten that list here too.
 *
 * @param {FhirNode} node
 * @param {string} path a dotted element path, for example "name.given"
 * @returns {FhirNode[]}
 */
export function nodesAt(node, path) {
  return resolvePath(node, path).flatMap((found) => (isList(found) ? found.items : [found]));
}

/**
 * The string values an element path selects, in document order. Reading through the model keeps
 * every value exactly as the transform wrote it.
 *
 * @param {FhirNode} node
 * @param {string} path a dotted element path, for example "name.family"
 * @returns {string[]}
 */
export function stringsAt(node, path) {
  return nodesAt(node, path).flatMap((found) =>
    isPrimitive(found) && typeof found.value === "string" ? [found.value] : [],
  );
}

/**
 * The Bundle's entries in order: fullUrl, resource type and the resource itself.
 *
 * @param {FhirComplex} bundle
 * @returns {{ fullUrl: string | undefined, type: string, resource: FhirComplex }[]}
 */
export function bundleEntries(bundle) {
  return nodesAt(bundle, "entry").flatMap((entry) => {
    const [resource] = nodesAt(entry, "resource");
    if (resource === undefined || !isComplex(resource)) return [];
    return [
      {
        fullUrl: stringsAt(entry, "fullUrl")[0],
        type: resourceType(resource) ?? "(unknown)",
        resource,
      },
    ];
  });
}

/**
 * Validate the Bundle and every resource in it with @cosyte/fhir.
 *
 * `validateResource` on a Bundle checks the Bundle itself (entry fullUrls, references between
 * entries) and the safety rules that apply anywhere, but not each entry's own resource rules, so
 * each entry is validated on its own too. Strict mode suits output you are about to send on: an
 * element the schema does not define is an error. The starter-kit profiles add, for Patient, a
 * required identifier.system and identifier.value.
 *
 * @param {FhirComplex} bundle
 * @returns {{ type: string, issues: readonly ValidationIssue[] }[]}
 */
export function validateBundle(bundle) {
  /** @type {import("@cosyte/fhir").ValidateOptions} */
  const options = { mode: "strict", profiles: STARTER_PROFILES };
  const targets = [{ type: "Bundle", resource: bundle }, ...bundleEntries(bundle)];
  return targets.map(({ type, resource }) => ({
    type,
    issues: validateResource(resource, options).issues,
  }));
}

/**
 * Issue counts by severity.
 *
 * @param {readonly { severity: string }[]} issues
 */
export function countBySeverity(issues) {
  /** @type {Record<"fatal" | "error" | "warning" | "information", number>} */
  const counts = { fatal: 0, error: 0, warning: 0, information: 0 };
  for (const { severity } of issues) {
    if (Object.hasOwn(counts, severity)) counts[/** @type {keyof typeof counts} */ (severity)] += 1;
  }
  return counts;
}
```

### src/main.js

```js title="hl7-to-fhir/src/main.js"
// @ts-check
import {
  bundleEntries,
  convertToFhir,
  countBySeverity,
  nodesAt,
  stringsAt,
  syntheticAdmit,
  validateBundle,
} from "./convert.js";

const SEED = 12345;

/**
 * Print one aligned line: a label, then the string values each path selects on `node`. Call it only
 * for paths that hold codes, statuses and references, never a value that identifies a person.
 *
 * @param {string} label
 * @param {import("@cosyte/fhir").FhirNode} node
 * @param {string} template the line, with each {path} replaced by the values that path selects
 */
function field(label, node, template) {
  const text = template.replace(/\{([\w.]+)\}/g, (_, path) => stringsAt(node, path).join(" "));
  console.log(`  ${label.padEnd(11)} ${text}`);
}

/**
 * The precision of a FHIR date, never the date: "year", "month", "day", or "absent".
 *
 * @param {string | undefined} date
 */
function precision(date) {
  if (date === undefined) return "absent";
  return ["year", "month", "day"][date.split("-").length - 1] ?? "time";
}

const wire = syntheticAdmit(SEED);
const { bundle, issues } = convertToFhir(wire);

// Nothing below prints a value that identifies a person, synthetic or not: an example that logs a
// patient's name teaches a pipeline to log one. It prints segment names, types, codes and counts.
const segmentNames = wire.split("\r").filter(Boolean).map((segment) => segment.slice(0, 3));
console.log(`Synthetic ADT^A01 from @cosyte/synth (seed ${SEED}), segments ${segmentNames.join(" ")}`);

// A message Bundle: the MessageHeader first, then the resources the message describes.
const entries = bundleEntries(bundle);
const type = stringsAt(bundle, "type")[0];
console.log(`\nFHIR R4 Bundle from @cosyte/transform (type ${type}, ${entries.length} entries):`);
for (const entry of entries) console.log(`  ${entry.type.padEnd(14)} ${entry.fullUrl}`);

const patient = entries.find((entry) => entry.type === "Patient");
if (patient) {
  // To see what a field holds, read it into a variable or assert on it. The values in these comments
  // are synthetic, from @cosyte/synth.
  const family = stringsAt(patient.resource, "name.family")[0]; // "Quillfeather", synthetic
  const mrn = stringsAt(patient.resource, "identifier.value")[0]; // "26068087", synthetic
  const birthDate = stringsAt(patient.resource, "birthDate")[0]; // "1961-08-09", synthetic
  const counts = ["name", "identifier", "telecom", "address"].map(
    (element) => `${element} ${nodesAt(patient.resource, element).length}`,
  );
  console.log("\nPatient (from PID):");
  console.log(`  ${"elements".padEnd(11)} ${counts.join(", ")}`);
  console.log(`  ${"family".padEnd(11)} ${family === undefined ? "absent" : "present"}`);
  console.log(`  ${"MRN".padEnd(11)} ${mrn === undefined ? "absent" : `${mrn.length} characters`}`);
  for (const id of nodesAt(patient.resource, "identifier")) {
    field("identifier", id, "type {type.coding.code}, system {system}");
  }
  console.log(`  ${"birthDate".padEnd(11)} precision ${precision(birthDate)}`);
}

const encounter = entries.find((entry) => entry.type === "Encounter");
if (encounter) {
  const subject = stringsAt(encounter.resource, "subject.reference")[0];
  const target = subject !== undefined && subject === patient?.fullUrl ? "the" : "not the";
  console.log("\nEncounter (from PV1):");
  field("class", encounter.resource, "{class.code} ({class.display})");
  field("status", encounter.resource, "{status}");
  field("subject", encounter.resource, `{subject.reference} (${target} Patient entry)`);
}

// Every issue is value-free: a stable code and positions, never a value from the message.
console.log("\nTransform diagnostics (severity, code, v2 location, FHIR path):");
for (const { severity, code, v2Location, fhirPath } of issues) {
  const row = [severity.padEnd(12), code.padEnd(35), v2Location.padEnd(7), fhirPath ?? ""];
  console.log(`  ${row.join(" ").trimEnd()}`);
}

console.log("\nValidation with @cosyte/fhir (strict mode, starter-kit profiles):");
const results = validateBundle(bundle);
for (const result of results) {
  const { fatal, error, warning, information } = countBySeverity(result.issues);
  const codes = [...new Set(result.issues.map((issue) => issue.code))];
  const named = codes.length > 0 ? ` (${codes.join(", ")})` : "";
  const row = `errors ${fatal + error}, warnings ${warning}, information ${information}${named}`;
  console.log(`  ${result.type.padEnd(14)} ${row}`);
}
const total = countBySeverity(results.flatMap((result) => result.issues));
const totals = `${total.fatal} fatal, ${total.error} errors, ${total.warning} warnings`;
console.log(`  ${"Total".padEnd(14)} ${totals}, ${total.information} information`);

if (total.fatal + total.error > 0) process.exitCode = 1;
```
