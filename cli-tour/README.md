# cli-tour

Walk the `cosyte` command from [`@cosyte/cli`](https://github.com/cosyte/cli) over a synthetic HL7 v2
admit message: parse it to typed JSON, summarize it, validate it, convert it to a FHIR R4 Bundle and
de-identify it. Each step prints the command it runs, what the CLI printed and the exit code.

Libraries: [`@cosyte/cli`](https://github.com/cosyte/cli), [`@cosyte/hl7`](https://github.com/cosyte/hl7),
[`@cosyte/synth`](https://github.com/cosyte/synth).

## Run it

```bash
npm install
npm start
```

Node 22 or later, and bash. `npm start` runs `bash tour.sh`; after `npm install` you can also run
`bash tour.sh` directly. The tour writes its files to `out/` (gitignored) and makes no network calls.

## Expected output

```text
== The CLI: cosyte from node_modules/.bin
$ cosyte --version
0.1.0
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
cosyte: redact: delegated to @cosyte/deid 0.1.0: Safe-Harbor-transformed per the configured policy
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

Nothing in this output varies from run to run. The Bundle that step 4 saves to `out/adt-a01.fhir.json`
does: its `fullUrl` and reference values are `urn:uuid:` identifiers that `@cosyte/transform`
generates at random on every conversion, so the tour prints the Bundle's shape (step 5), not the file.
Step 6 prints the same bytes every time: `redact` keys identifier surrogates with a new key on every
run, as its last line on stderr says, but the default policy of `@cosyte/deid` removes or generalizes
every value it acts on in this message and replaces none with a surrogate.

## Test

```bash
npm test
```

The test runs `tour.sh`, checks that every step exited 0, and checks the `inspect` summary, the
validation verdict, the conversion result and the redact manifest. It reads the files the tour wrote:
the parsed JSON holds every segment and `PID` value of the input, the Bundle's `Patient` name, birth
date and medical record number match `PID`, and the de-identified copy keeps every segment, no `PID`
identifier and only the year of the birth date. It then adds a visit number (`PV1-19`) to the same
message and checks that `redact` refuses it: exit `1`, nothing on stdout, and the blocked locus named
on stderr without its value. It also checks that no identifier from `PID` reaches the `inspect`
summaries or the notes on stderr. Expected values come from the synthetic input, not from pasted
output.

## How it works

1. `src/make-fixtures.js` calls `generateAdt({ seed: 12345, trigger: "A01" })` from
   `@cosyte/synth/hl7` and writes the wire text to `out/adt-a01.hl7`. The same seed gives the same
   bytes everywhere.
2. `tour.sh` puts `node_modules/.bin` first on `PATH`, so `cosyte` is the one `npm install` put there.
3. `cosyte parse` detects the format from the content (HL7 v2 here) and prints the parsed model as
   JSON on stdout. The tour saves it to `out/adt-a01.parsed.json` and shows its first lines.
4. `cosyte inspect` prints a structural summary with no field value in it: message type, version,
   segment counts and the warning count.
5. `cosyte validate` puts the verdict in the exit code (`0` valid, `1` invalid, `65` unparseable) and
   prints it on stderr.
6. `cosyte convert --to fhir` passes the parsed message to `@cosyte/transform` and prints the FHIR R4
   message Bundle on stdout. Its findings go to stderr as a severity, a code and a locator (an HL7
   position and the FHIR path it maps to), never a field value. Here it reports seven: among them,
   the phone number in `PID-13` and the location in `PV1-3` are dropped, a timestamp has no time
   zone, and the `EVN` segment reaches no resource in the Bundle. An error-severity finding would make
   it exit `1`.
7. `cosyte inspect` on the Bundle detects FHIR and prints the Bundle's type and its entries.
8. `cosyte redact` hands the message whole to `@cosyte/deid` and prints the de-identified copy on
   stdout. The tour saves it to `out/adt-a01.redacted.hl7` and prints its segments. stderr carries the
   library's value-free manifest: one line per locus with the category, the action, the position, the
   count, the disposition and a stable code. Under the library's default policy the medical record
   number, the name, the phone number and the SSN are removed, each date keeps only its year, and the
   address keeps only a 3-digit ZIP. The CLI passes no policy of its own.

`convert` and the FHIR commands need `@cosyte/transform` and `@cosyte/fhir`. `npm install` adds both:
the first is an optional dependency of `@cosyte/cli`, the second a peer dependency of the first.
`redact` needs `@cosyte/deid`, another optional dependency of `@cosyte/cli`, so `npm install` adds it
too.

Each step ends with `exit N`. A non-zero exit stops the tour with that code, so `npm start` fails when
a step fails. The code is in [`tour.sh`](tour.sh) and [`src/make-fixtures.js`](src/make-fixtures.js).

## Limits

- `redact` refuses rather than under-redacts. The default policy of `@cosyte/deid` 0.1.0 blocks a
  visit number (`PV1-19`) and a placer or filler order number (`ORC-2`/`ORC-3`, `OBR-2`/`OBR-3`)
  instead of removing it, and then `cosyte redact` prints nothing on stdout, names the blocked locus
  on stderr (`DEID_LOCUS_BLOCKED`) and exits `1` (`CLI_DEID_INCOMPLETE`). The synthetic message has
  no `PV1-19`, so step 6 exits `0`. Many real ADT messages carry one, so check the exit code before
  you use the copy. To choose a policy yourself, call `@cosyte/deid` from code, as the `deid-hl7`
  starter in this repository does.
- The de-identified copy is transformed per the library's Safe Harbor policy. It is not certified as
  de-identified. A position no rule covers passes through unchanged: here the message control ID
  (`MSH-10`) and the patient location (`PV1-3`).
- The diagnostics on stderr and the `inspect` summaries are value-free. The parsed model and the
  Bundle on stdout carry the patient's values, because that output is the data you asked for.
- `validate` calls an HL7 v2 message valid when it parses; parser warnings are shown but do not fail
  it. It is not a conformance check against a profile.
- The `@cosyte/transform` that `@cosyte/cli` 0.1.0 installs (0.1.0) has no converter for phone
  numbers, so the Bundle's `Patient` has no `telecom`. The drop is reported as a finding, not hidden.

## Synthetic data

The message comes from `@cosyte/synth`, which draws every name, identifier, date, phone and address
from reserved or fictional ranges. It is not real patient data. The tour generates it at run time into
`out/`, and nothing it generates is committed.

## Versions

The `@cosyte/*` versions are set in [`package.json`](package.json). After changing one, run
`npm install` to refresh `package-lock.json`, then `npm test`. The tour prints `cosyte --version`
first, so you can tell which CLI produced your output. `@cosyte/cli` 0.1.0 and this starter use the
same `@cosyte/hl7` 0.1.0, so npm installs one copy.

Need it integrated? [Talk to us](https://cosyte.com/contact).
