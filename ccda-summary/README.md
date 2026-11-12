# ccda-summary

Parse a C-CDA document with [`@cosyte/ccda`](https://github.com/cosyte/ccda) and print its document
type, what it records about the patient, and the problems, medications, and allergies, read through
the library's typed section accessors.

It prints no value that identifies the patient, synthetic as it is: for the patient it prints what
is recorded and the precision of the birth date, and for each problem the precision of its onset,
never the date. The problems, medications, and allergies print as codes and their display names.
`src/main.js` reads the name, the record number, and the birth date into variables, with their
synthetic values in comments, to show what each holds.

Libraries: [`@cosyte/ccda`](https://github.com/cosyte/ccda), [`@cosyte/synth`](https://github.com/cosyte/synth).

## Run it

```bash
npm install
npm start
```

Node 22 or later.

## Expected output

```text
Synthetic CCD from @cosyte/synth (seed 198), 16493 characters of XML:
  Document type  ccd (LOINC 34133-9, Summarization of Episode Note)
  Patient        name and MRN recorded, birth date to the day
  Warnings       none

Problems (3):
  Type 2 diabetes mellitus
    SNOMED CT 44054006, status active, onset to the day
  Hypertensive disorder
    SNOMED CT 38341003, status active, onset to the day
  Essential hypertension
    SNOMED CT 59621000, status active, onset to the day

Medications (2):
  Amlodipine 5 MG Oral Tablet
    RxNorm 197361, dose 1 {tablet}, route Oral, every 24 h, status active
  Acetaminophen 325 MG Oral Tablet
    RxNorm 1049221, dose 1 {tablet}, route Oral, every 8 h, status active

Allergies (1):
  Cow's milk (substance)
    SNOMED CT 3718001, reaction Urticaria (disorder), severity not recorded, status active
```

The document is a synthetic Continuity of Care Document (CCD). The starter serializes it to XML text
first and parses that text, so it reads the document the way it would read one a sending system
handed you. Severity reads `not recorded` because the synthetic allergy carries no Severity
Observation, and the starter never fills in a value the document does not carry.

## Test

```bash
npm test
```

The test runs `src/main.js` and checks the document type, the patient line, and one entry per
problem, medication, and allergy against a parse of the same document, and that the output holds no
name, record number, birth date, or onset date. It then checks the summary
against the XML: one row per Problem Observation, Medication Activity, and Allergy Observation,
every reported code written in the document, every drug coded in RxNorm, and the medical record
number taken from the patient's identifiers.

## Integration tests

`npm test` also runs the fast integration tests, `test/integration/*.fast.test.js`. `npm run test:full`
runs every test, the seed sweeps in `test/integration/*.full.test.js` included, and fails unless the
helpers in `test/integration/support.js` are fully covered. They call the libraries' public APIs only,
on synthetic data.

- Synthetic Continuity of Care Documents and Referral Notes from `@cosyte/synth` parse with no
  warning, serialize back to the same XML, and give the same summary.
- `@cosyte/terminology` resolves every `codeSystem` OID they name, except four HL7 v3 code systems
  and the NCI Thesaurus, which its identity table does not list (`KNOWN_UNRESOLVED_OIDS` in
  `test/integration/support.js`).
- `deidentifyCcda` from `@cosyte/deid` de-identifies each document. The output parses as the same
  document type with the same problem, medication, and allergy codes; the MRN, the name, and the
  birth date are gone from it, the manifest, and the residual list; the birth time keeps its year.
  The pass blocks the section narratives, which breaks the entries' references into them, so
  `NARRATIVE_REFERENCE_BROKEN` is the one new warning the output may read back with.
- The full suite runs the same checks over 150 seeds of each document type.

## How it works

1. `generateCcd({ seed: 198 })` from `@cosyte/synth/ccda` builds a CCD through `@cosyte/ccda`'s own
   builder, and `serializeCcda` turns it into XML text. The same seed gives the same bytes everywhere.
2. `parseCcda(xml)` from `@cosyte/ccda` parses the text. Recoverable quirks become stable-coded
   warnings on `doc.warnings` rather than failures; hostile input (a DTD, entity expansion, an oversized
   document) throws a `CcdaParseError`.
3. `summarize(doc)` in `src/ccda.js` reads the typed accessors: `getPatient()` and `getMrn()` for the
   patient, `getProblems()` for the Problem Concern Acts (each concern carries the status, each Problem
   Observation the coded condition and its onset), `getMedications()` for the Medication Activities
   (drug, dose, route, frequency, status), and `getAllergies()` for the Allergy Concern Acts (the
   allergen, each reaction and its severity).
4. A C-CDA names each code system by OID. `@cosyte/ccda` exports the OIDs (`SNOMED_CT`, `RXNORM`,
   `ICD10_CM`, and others), and `src/ccda.js` maps them to the names we print.

The code is in [`src/ccda.js`](src/ccda.js) and [`src/main.js`](src/main.js).

## Limits

- On the 0.1 line, `@cosyte/synth` writes active entries only, one allergy with one reaction, and no
  Severity or Criticality observation. It draws each code from its example pools on its own, so the
  record is not clinically coherent: read it as parser input, not as a patient.
- `@cosyte/ccda` checks that a code's system is one expected for its slot. It does not check that the
  code exists in that system; for that, pass your own terminology service as the `terminology` option
  of `parseCcda`.
- `@cosyte/ccda` pins its XML parser, `@xmldom/xmldom`, to one exact version, so a fix to that
  parser reaches this starter only through a new `@cosyte/ccda` release. This starter does not
  override the pin.

## Synthetic data

The document comes from `@cosyte/synth`, which draws every name, identifier, and date from reserved
or fictional ranges; the medical record number sits under a synthetic assigning-authority OID. It is
not real patient data.

## Versions

The `@cosyte/*` versions are set in [`package.json`](package.json). After changing one, run
`npm install` to refresh `package-lock.json`, then `npm test`.

Need it built, or hosted and run for you? [Talk to us](https://cosyte.com/integration-services?utm_source=github&utm_medium=readme&utm_campaign=evergreen&utm_content=examples).
