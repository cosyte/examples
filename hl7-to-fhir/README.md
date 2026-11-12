# hl7-to-fhir

Convert a synthetic HL7 v2 admit message (ADT^A01) into a FHIR R4 message Bundle with
[`@cosyte/transform`](https://github.com/cosyte/transform), then validate the Bundle and every
resource in it with [`@cosyte/fhir`](https://github.com/cosyte/fhir).

Libraries: [`@cosyte/transform`](https://github.com/cosyte/transform),
[`@cosyte/fhir`](https://github.com/cosyte/fhir), [`@cosyte/hl7`](https://github.com/cosyte/hl7),
[`@cosyte/synth`](https://github.com/cosyte/synth).

## Run it

```bash
npm install
npm start
```

Node 22 or later. `@cosyte/hl7` and `@cosyte/fhir` are peer dependencies of `@cosyte/transform`, so
they are listed in `package.json` beside it.

## Expected output

```text
Synthetic ADT^A01 from @cosyte/synth (seed 12345):
  MSH|^~\&|COSYTE-SYNTH|SYNTH-FAC|RECEIVER|RECV-FAC|20220305042943||ADT^A01|SYNTH4722901508|T|2.5
  EVN|A01|20220305042943
  PID|1||26068087^^^COSYTE-SYNTH^MR||Quillfeather^Fixtura||19610809|M|||7117 Sample Street^^Synthville^MN^00000||(528) 555-0105||||||969217321
  PV1|1|E|SYNTHWARD^909^01

FHIR R4 Bundle from @cosyte/transform (type message, identifier SYNTH4722901508):
  MessageHeader  urn:uuid:00000000-0000-4000-8000-000000000003
  Patient        urn:uuid:00000000-0000-4000-8000-000000000001
  Encounter      urn:uuid:00000000-0000-4000-8000-000000000002

Patient (from PID):
  name        family Quillfeather, given Fixtura
  identifier  26068087, type MR, system https://example.org/fhir/sid/synthetic-mrn
  gender      male
  birthDate   1961-08-09
  address     line 7117 Sample Street, city Synthville, state MN, postalCode 00000

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

## Test

```bash
npm test
```

The test runs `src/main.js` and checks the Patient name and the validation total. For four seeds
that cover patient classes E, O, and I, and both sexes, it then converts the admit in process and
checks the Bundle against the parsed HL7 input: the Patient's name, identifier, gender, birth date,
and address come from `PID`, the Encounter's class comes from `PV1-2` through the guide's map, its
subject is the Patient entry, and `@cosyte/fhir` reports no errors. It also checks that no value
from the message appears in the transform's diagnostics, and that without an identifier system the
starter Patient profile flags `Patient.identifier.system`.

## Integration tests

`npm test` also runs the fast integration tests, `test/integration/*.fast.test.js`. `npm run test:full`
runs every test, the seed sweeps in `test/integration/*.full.test.js` included, and fails unless the
helpers in `test/integration/support.js` are fully covered. They call the libraries' public APIs only,
on synthetic data.

- Every HL7 v2 message kind `@cosyte/synth` generates (ADT^A01, ADT^A04, ADT^A08, ORU^R01,
  ORM^O01, SIU^S12, VXU^V04) is converted by `@cosyte/transform`. Each resource validates in strict
  mode with no error (the starter Patient profile on the Patient), the Patient carries `PID-3` and
  `PID-5`, and no patient value reaches the transform's diagnostics.
- `@cosyte/terminology` checks the codes: every `Quantity` coded in UCUM is valid UCUM, and every
  coding system the transform writes resolves, except three HL7 v3 code systems its identity table
  does not list (`KNOWN_UNRESOLVED_SYSTEMS` in `test/integration/support.js`). A unit that `OBX-6`
  declares as UCUM reaches `Quantity.code`; one it does not declare is kept as `Quantity.unit` only,
  with a `TRANSFORM_UNIT_NOT_UCUM` warning.
- An ORU^R01 gives one Observation per `OBX`, and a DiagnosticReport only when `OBR-25` gives it a
  status. The synthetic ORU leaves `OBR-25` empty, so the transform withholds the report and says so
  with `TRANSFORM_RESOURCE_INVALID`.
- `deidentifyFhir` from `@cosyte/deid` de-identifies each Bundle: no PID value is left in it, in the
  manifest, or in the residual list, nothing is blocked, a ZIP code keeps at most three digits, the
  Bundle reads back with `@cosyte/fhir` with no new issue, and the clinical codes are unchanged.
- One animal patient goes through every package. `generateAdt({ subject: "animal" })` from
  `@cosyte/synth` writes a veterinary ADT (the pet's name in `PID-5`, a microchip in `PID-3`, the
  species in `PID-35`, the breed in `PID-36`, the owner in an `NK1`). It crosses a real MLLP link on
  127.0.0.1 (`@cosyte/mllp`), whose listener runs the rest before it answers AA: `@cosyte/hl7` reads
  `patient.species` and `patient.breed`, `@cosyte/transform` writes them to the `patient-animal`
  extension, `readPatientAnimal` from `@cosyte/fhir` reads them back, the Patient validates against
  `VETERINARY_PATIENT_STARTER` with no issue, and `@cosyte/deid` de-identifies the HL7 v2 message and the Bundle.
  At every step species and breed come out as they went in, or the step says it lost them (an issue,
  or a manifest row); a step that loses either with no word fails the test. Both de-identified
  outputs keep no pet name, microchip, record number, owner name, or street. The seeds cover a horse,
  a dog, a cat, and cattle.
- The HL7 v2 de-identification keeps `PID-35` and `PID-36` and removes `PID-5`, the microchip in
  `PID-3`, and the owner's name in `NK1-2`. The FHIR de-identification blocks every extension value,
  the `patient-animal` extension included, and records each in its manifest, so the Bundle it
  returns has no species or breed. A `todo` test marks that until `@cosyte/deid` keeps them.
- The full suite runs the same checks over 250 seeds of every kind, and over 250 seeds of each animal
  ADT trigger (A01, A04, A08).

## How it works

1. `generateAdt({ seed: 12345, trigger: "A01" })` from `@cosyte/synth/hl7` builds the admit message,
   and `parseHL7` from `@cosyte/hl7` parses it.
2. `toFhir(message, options)` from `@cosyte/transform` builds a FHIR R4 message `Bundle`: a
   `MessageHeader` from `MSH`, a `Patient` from `PID`, and an `Encounter` from `PV1`, grounded on
   the maps of the HL7 Version 2 to FHIR implementation guide. Two options matter here:
   - `namingSystem`: `createNamingSystem({ authorities: { "COSYTE-SYNTH": MRN_SYSTEM } })` says
     which identifier system the assigning authority in `PID-3` stands for. Without it the transform
     keeps the MRN, leaves `identifier.system` out, and raises a warning, because it never builds a
     system URI from a bare namespace.
   - `generateId`: numbered `urn:uuid:` fullUrls, so the output is the same on every run. Leave it
     out in production and the transform uses `crypto.randomUUID`. The transform identifies entries
     by fullUrl and leaves `Resource.id` unset.
3. Every diagnostic the transform raises is value-free: a severity, a stable code, a v2 location,
   and, where one applies, a FHIR path. `MSH-7` carries no UTC offset and `Bundle.timestamp` needs
   one, so the transform leaves the timestamp out rather than guess one: that is the `TS.1` warning
   and the `MSH.7` row. If you know your sender's offset, pass `assumeTimezoneOffsetMinutes`; the
   timestamp is then kept and the warning still marks it as asserted. The `EVN[1]` row says that the
   `EVN` segment reached no resource in the Bundle although the implementation guide publishes a map
   for it, so the Bundle does not carry what that segment said.
4. `validateResource` from `@cosyte/fhir` validates the Bundle, then each entry on its own. On a
   Bundle it runs the safety rules that apply anywhere (an unknown `modifierExtension`, for example)
   and a Bundle-integrity check, but not each resource's own rules, such as the codes allowed in
   `Patient.gender`. The integrity check resolves `Type/id` and `#` references and counts a
   `urn:uuid:` reference as external, so it does not check that the transform's references reach an
   entry: the starter prints whether the Encounter's subject is the Patient entry, and the test
   checks it. Strict mode makes an element the schema does not define an error. `STARTER_PROFILES`
   adds the starter-kit profiles: the Patient one requires `identifier.system` and
   `identifier.value`.
5. The printed values are read from the FHIR model with `resolvePath`, so each one is what the
   transform wrote. `serializeResource(bundle)` from `@cosyte/fhir` gives you the Bundle as FHIR JSON.

The code is in [`src/convert.js`](src/convert.js) and [`src/main.js`](src/main.js).

## Limits

- On the 0.1 line, `@cosyte/fhir` has no structural schema for `Bundle` or `MessageHeader`. For
  those two it checks the base resource elements and the safety rules, and reports
  `RESOURCE_NOT_MODELED` (information) to say that their own elements were not checked. Zero errors
  here is not a full FHIR conformance verdict.
- The Patient carries `PID-3` (identifiers), `PID-5` (name), `PID-7` (birth date), `PID-8` (sex),
  and `PID-11` (address), and for an animal `PID-35` (species) and `PID-36` (breed) in the
  `patient-animal` extension. `PID-13` (phone), `PID-19` (SSN) and `PV1-3` (location) are dropped,
  each with a diagnostic.
- On the 0.1 line of `@cosyte/fhir`, `resolvePath` returns a repeating element named by the last
  path segment (`entry`, `name.given`) as one list node rather than its items. `nodesAt` in
  [`src/convert.js`](src/convert.js) flattens it.
- US Core profiles are not bundled with `@cosyte/fhir`. To validate against them, read each
  StructureDefinition with `parseResource`, load it with `loadStructureDefinition`, and pass the
  results as `profiles`.

## Synthetic data

The message comes from `@cosyte/synth`, which draws every name, identifier, date, phone, and address
from reserved or fictional ranges. It is not real patient data. The identifier system uses the
reserved `example.org` domain.

## Versions

The `@cosyte/*` versions are set in [`package.json`](package.json). After changing one, run
`npm install` to refresh `package-lock.json`, then `npm test`.

Need it built, or hosted and run for you? [Talk to us](https://cosyte.com/integration-services?utm_source=github&utm_medium=readme&utm_campaign=evergreen&utm_content=examples).
