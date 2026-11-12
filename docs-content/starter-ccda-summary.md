---
id: starter-ccda-summary
title: Summarize a C-CDA document
sidebar_label: ccda-summary
description: "A C-CDA document parsed into its type, the patient, and the problems, medications and allergies, through the library's typed section accessors."
---

# Summarize a C-CDA document

The `ccda-summary` starter parses a synthetic C-CDA document and prints its document type, the
patient, and the problems, medications and allergies, read through the library's typed section
accessors.

Libraries: [`@cosyte/ccda`](https://docs.cosyte.com/ccda/),
[`@cosyte/synth`](https://docs.cosyte.com/synth/).

## What it shows

- **Parsing text a sender hands you.** The starter serializes the synthetic document to XML first and
  parses that text with `parseCcda`. Recoverable quirks become stable-coded warnings on
  `doc.warnings`; hostile input (a DTD, entity expansion, an oversized document) throws a
  `CcdaParseError`.
- **The typed accessors.** `summarize(doc)` in `src/ccda.js` reads `getPatient()` and `getMrn()`,
  `getProblems()` (each concern carries the status, each Problem Observation the condition and its
  onset), `getMedications()` (drug, dose, route, frequency, status) and `getAllergies()` (the
  allergen, each reaction and its severity).
- **Code systems by name.** A C-CDA names each code system by OID. `@cosyte/ccda` exports the OIDs,
  and `src/ccda.js` maps them to the names it prints.
- **Nothing filled in.** Severity reads `not recorded` when the document carries no Severity
  Observation: the starter never fills in a value the document does not carry.

## Run it

From a clone of [cosyte/examples](https://github.com/cosyte/examples), on Node 22 or later:

```bash
cd examples/ccda-summary
npm ci
npm start
```

`npm test` runs the starter and checks the document type, the patient line, and one entry per
problem, medication and allergy against a parse of the same document. It then checks the summary
against the XML: one row per Problem Observation, Medication Activity and Allergy Observation, every
reported code written in the document, every drug coded in RxNorm, and the medical record number
taken from the patient's identifiers.

## Before you build on it

- On the 0.1 line, `@cosyte/synth` writes active entries only, one allergy with one reaction, and no
  Severity or Criticality observation, and draws each code on its own, so the record is not
  clinically coherent: read it as parser input, not as a patient.
- `@cosyte/ccda` checks that a code's system is one expected for its slot, not that the code exists
  in that system. For that, pass your own terminology service as the `terminology` option of
  `parseCcda`.

## Expected output

What `npm start` prints, as the starter's README gives it. This section and the next are generated from the starter by `scripts/docs-content.mjs`, and CI fails when they no longer match it.

```text
Synthetic CCD from @cosyte/synth (seed 198), 16493 characters of XML:
  Document type  ccd (LOINC 34133-9, Summarization of Episode Note)
  Patient        Voidwin Reprodus, MRN 13352434, born 1973-04-08, gender F
  Warnings       none

Problems (3):
  Type 2 diabetes mellitus
    SNOMED CT 44054006, status active, onset 2014-03-26
  Hypertensive disorder
    SNOMED CT 38341003, status active, onset 2012-04-30
  Essential hypertension
    SNOMED CT 59621000, status active, onset 2011-02-01

Medications (2):
  Amlodipine 5 MG Oral Tablet
    RxNorm 197361, dose 1 {tablet}, route Oral, every 24 h, status active
  Acetaminophen 325 MG Oral Tablet
    RxNorm 1049221, dose 1 {tablet}, route Oral, every 8 h, status active

Allergies (1):
  Cow's milk (substance)
    SNOMED CT 3718001, reaction Urticaria (disorder), severity not recorded, status active
```

## Files

The starter's code, every file of `ccda-summary/` as this release holds it, except its README, its lockfile and its tests, which are in the repository: [ccda-summary on GitHub](https://github.com/cosyte/examples/tree/main/ccda-summary).

### package.json

```json title="ccda-summary/package.json"
{
  "name": "cosyte-example-ccda-summary",
  "version": "0.0.0",
  "private": true,
  "description": "Parse a synthetic C-CDA document with @cosyte/ccda and print its problems, medications and allergies.",
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
    "@cosyte/ccda": "^0.1.0",
    "@cosyte/synth": "^0.1.0"
  },
  "devDependencies": {
    "@cosyte/deid": "^0.1.0",
    "@cosyte/terminology": "^0.1.0"
  }
}
```

### src/ccda.js

```js title="ccda-summary/src/ccda.js"
// @ts-check
import { ICD10_CM, LOINC, NCI_ROUTE, NDC, RXNORM, SNOMED_CT, UNII, serializeCcda } from "@cosyte/ccda";
import { generateCcd } from "@cosyte/synth/ccda";

/** @typedef {import("@cosyte/ccda").CcdaDocument} CcdaDocument */
/** @typedef {import("@cosyte/ccda").CD} CD */

// A C-CDA code names its code system by OID. @cosyte/ccda exports the OIDs; we add the names.
const CODE_SYSTEM_NAMES = new Map([
  [SNOMED_CT, "SNOMED CT"],
  [ICD10_CM, "ICD-10-CM"],
  [RXNORM, "RxNorm"],
  [LOINC, "LOINC"],
  [NCI_ROUTE, "NCI Thesaurus"],
  [NDC, "NDC"],
  [UNII, "UNII"],
]);

/**
 * A synthetic Continuity of Care Document as the XML a sending system would hand you. The same seed
 * gives the same bytes on every machine.
 *
 * @param {number} seed
 * @returns {string}
 */
export function syntheticCcdXml(seed) {
  return serializeCcda(generateCcd({ seed }));
}

/**
 * "SNOMED CT 44054006" for a coded value, or undefined when it carries no code.
 *
 * @param {CD | undefined} cd
 */
export function codeLabel(cd) {
  if (cd?.code === undefined) return undefined;
  const system = cd.codeSystem === undefined ? undefined : CODE_SYSTEM_NAMES.get(cd.codeSystem);
  return `${system ?? cd.codeSystemName ?? cd.codeSystem ?? "no code system"} ${cd.code}`;
}

/**
 * The date part of an HL7 v3 timestamp as YYYY-MM-DD (or YYYY-MM, or YYYY, at the precision sent).
 *
 * @param {import("@cosyte/ccda").TS | undefined} ts
 */
export function v3Date(ts) {
  const [, year, month, day] = /^(\d{4})(\d{2})?(\d{2})?/.exec(ts?.raw ?? "") ?? [];
  return year === undefined ? undefined : [year, month, day].filter(Boolean).join("-");
}

/**
 * "every 8 h" for a periodic frequency (PIVL_TS), in the period and UCUM unit the document sent.
 *
 * @param {import("@cosyte/ccda").MedicationFrequency | undefined} frequency
 */
function every(frequency) {
  const period = frequency?.period;
  return period?.raw === undefined ? undefined : `every ${period.raw}${period.unit ? ` ${period.unit}` : ""}`;
}

/**
 * The document type, patient and reconciliation triad of a parsed C-CDA, read with the typed section
 * accessors. Nothing absent is filled in: a missing value stays undefined.
 *
 * @param {CcdaDocument} doc
 */
export function summarize(doc) {
  const patient = doc.getPatient();
  return {
    documentType: doc.documentType,
    documentCode: codeLabel(doc.header.code),
    documentTitle: doc.header.code?.displayName ?? doc.header.title,
    patient: {
      name: [...(patient?.name?.given ?? []), patient?.name?.family].filter(Boolean).join(" ") || undefined,
      mrn: doc.getMrn(),
      birthDate: v3Date(patient?.birthTime),
      gender: patient?.genderCode?.code,
    },
    // A Problem Concern Act wraps one or more Problem Observations; the concern carries the status.
    problems: doc.getProblems().flatMap((concern) =>
      concern.problems.map((problem) => ({
        name: problem.value?.displayName,
        code: codeLabel(problem.value),
        status: concern.status,
        onset: v3Date(problem.effectiveTime?.low),
      })),
    ),
    medications: doc.getMedications().map((med) => ({
      name: med.drug?.displayName,
      code: codeLabel(med.drug),
      dose: med.dose && [med.dose.raw, med.dose.unit].filter(Boolean).join(" "),
      route: med.route?.displayName,
      frequency: every(med.frequency),
      status: med.statusCode,
    })),
    // An Allergy Concern Act wraps the observations. The substance is the allergen, not the
    // observation value (that is the allergy type), and each reaction may carry its own severity.
    allergies: doc.getAllergies().flatMap((concern) =>
      concern.allergies.map((allergy) => ({
        substance: allergy.noKnownAllergy ? "No known allergies" : allergy.allergen?.displayName,
        code: codeLabel(allergy.allergen),
        reactions: allergy.reactions.map((reaction) => ({
          manifestation: reaction.manifestation?.displayName,
          severity: reaction.severity?.displayName,
        })),
        status: concern.status,
      })),
    ),
  };
}
```

### src/main.js

```js title="ccda-summary/src/main.js"
// @ts-check
import { parseCcda } from "@cosyte/ccda";
import { summarize, syntheticCcdXml } from "./ccda.js";

const SEED = 198;

/** @param {string | undefined} value */
const shown = (value) => value ?? "not recorded";

// parseCcda takes the XML text of a C-CDA document: here a synthetic CCD, in your integration the
// document a sending system handed you. Quirks become warnings on doc.warnings, not failures.
const xml = syntheticCcdXml(SEED);
const doc = parseCcda(xml);
const summary = summarize(doc);

console.log(`Synthetic CCD from @cosyte/synth (seed ${SEED}), ${xml.length} characters of XML:`);
const { documentType, documentCode, documentTitle } = summary;
console.log(`  Document type  ${shown(documentType)} (${shown(documentCode)}, ${shown(documentTitle)})`);
const { name, mrn, birthDate, gender } = summary.patient;
console.log(`  Patient        ${shown(name)}, MRN ${shown(mrn)}, born ${shown(birthDate)}, gender ${shown(gender)}`);
console.log(`  Warnings       ${doc.warnings.map((w) => w.code).join(", ") || "none"}`);

console.log(`\nProblems (${summary.problems.length}):`);
for (const problem of summary.problems) {
  console.log(`  ${shown(problem.name)}`);
  console.log(`    ${shown(problem.code)}, status ${problem.status}, onset ${shown(problem.onset)}`);
}

console.log(`\nMedications (${summary.medications.length}):`);
for (const med of summary.medications) {
  console.log(`  ${shown(med.name)}`);
  console.log(
    `    ${shown(med.code)}, dose ${shown(med.dose)}, route ${shown(med.route)},`,
    `${med.frequency ?? "frequency not recorded"}, status ${shown(med.status)}`,
  );
}

console.log(`\nAllergies (${summary.allergies.length}):`);
for (const allergy of summary.allergies) {
  const reactions = allergy.reactions
    .map((reaction) => `reaction ${shown(reaction.manifestation)}, severity ${shown(reaction.severity)}`)
    .join("; ");
  console.log(`  ${shown(allergy.substance)}`);
  console.log(`    ${shown(allergy.code)}, ${reactions || "reaction not recorded"}, status ${allergy.status}`);
}
```
