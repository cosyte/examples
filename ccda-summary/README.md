# ccda-summary

Parse a C-CDA document with [`@cosyte/ccda`](https://github.com/cosyte/ccda) and print its document
type, the patient, and the problems, medications and allergies, read through the library's typed
section accessors.

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

The document is a synthetic Continuity of Care Document (CCD). The starter serializes it to XML text
first and parses that text, so it reads the document the way it would read one a sending system
handed you. Severity reads `not recorded` because the synthetic allergy carries no Severity
Observation, and the starter never fills in a value the document does not carry.

## Test

```bash
npm test
```

The test runs `src/main.js` and checks the document type, the patient line and one entry per problem,
medication and allergy against a parse of the same document. It then checks the summary against the
XML: one row per Problem Observation, Medication Activity and Allergy Observation, every reported code
written in the document, every drug coded in RxNorm, and the medical record number taken from the
patient's identifiers.

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
   `ICD10_CM` and others), and `src/ccda.js` maps them to the names we print.

The code is in [`src/ccda.js`](src/ccda.js) and [`src/main.js`](src/main.js).

## Limits

- `@cosyte/synth` 0.1.0 writes active entries only, one allergy with one reaction, and no Severity or
  Criticality observation. It draws each code from its example pools on its own, so the record is not
  clinically coherent: read it as parser input, not as a patient.
- `@cosyte/ccda` checks that a code's system is one expected for its slot. It does not check that the
  code exists in that system; for that, pass your own terminology service as the `terminology` option
  of `parseCcda`.
- With `@cosyte/ccda` 0.1.0, `npm install` prints a deprecation notice for `@xmldom/xmldom` 0.9.10,
  the XML parser that release pins exactly, and `npm audit` reports advisories against it (one of
  them high severity) with no fix available, because the pin is exact. This starter does not override
  the pin.

## Synthetic data

The document comes from `@cosyte/synth`, which draws every name, identifier and date from reserved or
fictional ranges; the medical record number sits under a synthetic assigning-authority OID. It is not
real patient data.

## Versions

The `@cosyte/*` versions are set in [`package.json`](package.json). After changing one, run
`npm install` to refresh `package-lock.json`, then `npm test`.

Need it integrated? [Talk to us](https://cosyte.com/contact).
