# deid-hl7

Run a synthetic HL7 v2 admit message through the Safe Harbor policy of
[`@cosyte/deid`](https://github.com/cosyte/deid) and print the value-free manifest: which identifier
categories it acted on, at which locus, and how, without a single value.

Libraries: [`@cosyte/deid`](https://github.com/cosyte/deid),
[`@cosyte/hl7`](https://github.com/cosyte/hl7), [`@cosyte/synth`](https://github.com/cosyte/synth).

## Run it

```bash
npm install
npm start
```

Node 22 or later. Set `DEID_KEY` to your own key to keep keyed surrogates stable across runs.

## Expected output

```text
Synthetic ADT^A01 from @cosyte/synth (seed 12345):
  MSH|^~\&|COSYTE-SYNTH|SYNTH-FAC|RECEIVER|RECV-FAC|20220305042943||ADT^A01|SYNTH4722901508|P|2.5
  EVN|A01|20220305042943
  PID|1||26068087^^^COSYTE-SYNTH^MR||Quillfeather^Fixtura||19610809|M|||7117 Sample Street^^Synthville^MN^00000||(528) 555-0105||||||969373218
  PV1|1|E|SYNTHWARD^529^01

De-identified (Safe Harbor policy):
  MSH|^~\&|COSYTE-SYNTH|SYNTH-FAC|RECEIVER|RECV-FAC|20220305042943||ADT^A01|SYNTH4722901508|P|2.5
  EVN|A01|20220305042943
  PID|1||34849eb5da9a9fe1440f06695c18316404e6f7496f890f3135274cec3d6e648f^^^COSYTE-SYNTH^MR||||1961|M|||^^^^000||||||||
  PV1|1|E|SYNTHWARD^529^01

Manifest (value-free: locus, category, transform, disposition, code):
  PID-3[0]     MRN          pseudonymize transformed  DEID_CATEGORY_PSEUDONYMIZED
  PID-5        NAMES        redact       removed      DEID_CATEGORY_REMOVED
  PID-7        DATES        generalize   transformed  DEID_RESIDUAL_RETAINED
  PID-11[0]    GEOGRAPHIC   generalize   transformed  DEID_RESIDUAL_RETAINED
  PID-13       PHONE        redact       removed      DEID_CATEGORY_REMOVED
  PID-19       SSN          redact       removed      DEID_CATEGORY_REMOVED

Input identifiers checked: 7
Found in the de-identified message: 0
Found in the manifest: 0
```

The surrogate in `PID-3` is a keyed HMAC of the medical record number, so it differs from run to run
unless `DEID_KEY` is set. The name, phone and national identifier are removed, the date of birth keeps
only its year, and the address keeps only the Safe Harbor three-digit ZIP (`000` for a restricted
prefix).

## Test

```bash
npm test
```

The test runs `src/main.js` and checks the manifest rows for the name, date of birth, phone and
national identifier. It then de-identifies the message again in process and checks that no identifier
read from the input `PID` segment appears in the output message or in the manifest.

## How it works

1. `generateAdt({ seed: 12345, trigger: "A01" })` from `@cosyte/synth/hl7` builds the admit message
   through `@cosyte/hl7`'s own builder. The same seed gives the same bytes everywhere.
2. `parseHL7` from `@cosyte/hl7` parses it. `@cosyte/deid` locates identifiers structurally in that
   model (PID-5 is the patient name because the standard says so), not by pattern matching the text.
3. `deidentifyHl7(message, { context })` from `@cosyte/deid/hl7` returns a new message and the
   manifest. The input message is never changed.
4. `createDeidContext({ key })` holds the key for keyed transforms. The key never appears in the
   output or in the manifest.
5. `src/main.js` ends with a check you can keep in your own pipeline: every identifier read from the
   input is searched for in the output and in the manifest, and the process exits 1 if one is found.

The code is in [`src/deid.js`](src/deid.js) and [`src/main.js`](src/main.js).

## Limits

- The output is transformed per the configured Safe Harbor policy. It is not certified as
  de-identified, and `@cosyte/deid` renders no Expert Determination.
- Free text in `OBX-5` and `NTE-3` and any Z-segment are blocked by default, not scrubbed.
- The manifest lists what the policy acted on, and only that. With `@cosyte/deid` 0.0.9, the message
  and event timestamps (`MSH-7`, `EVN-2`) pass through unchanged and are not in the manifest: review
  the output against the positions your own policy must cover.

## Synthetic data

The message comes from `@cosyte/synth`, which draws every name, identifier, date, phone and address
from reserved or fictional ranges. It is not real patient data.

## Versions

The `@cosyte/*` versions are set in [`package.json`](package.json). After changing one, run
`npm install` to refresh `package-lock.json`, then `npm test`.

Need it integrated? [Talk to us](https://cosyte.com/contact).
