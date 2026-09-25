# astm-lab-results

Decode a synthetic analyzer upload, ASTM E1394 result records carried in E1381 frames, with
[`@cosyte/astm`](https://github.com/cosyte/astm), and print each frame's checksum verdict, the header,
the patient and order IDs, and a results table read from the library's typed result model.

Libraries: [`@cosyte/astm`](https://github.com/cosyte/astm),
[`@cosyte/synth`](https://github.com/cosyte/synth).

## Run it

```bash
npm install
npm start
```

Node 22 or later.

## Expected output

```text
Synthetic E1381-framed upload from @cosyte/synth (seed 1033), 494 bytes:
  Frame  End  Checksum  Record
  1      ETX  05 ok     H|\^&|FIXTURE-HOST|MOCK-CHEM^ModelC^2
  2      ETX  26 ok     P|1|PRA85979089|LAB85711132||Dummerton^Testina^C||19410709|M
  3      ETX  1C ok     O|1|ACC45131375||^^^ALL|R||||||N||||||||||||||F
  4      ETX  DD ok     R|1|^^^TSH^Thyrotropin^3016-3|0.70|mIU/L|0.40-4.50|N||F
  5      ETX  ED ok     R|2|^^^CREA^Creatinine^2160-0|0.5|mg/dL|0.6-1.3|L||F
  6      ETX  41 ok     R|3|^^^WBC^Leukocytes^6690-2|14.5|10*3/uL|4.5-11.0|H||F
  7      ETX  B4 ok     R|4|^^^HGB^Hemoglobin^718-7|10.8|g/dL|12.0-17.5|L||F
  0      ETX  CA ok     C|1|L|Placeholder result comment for conformance testing.|G
  1      ETX  04 ok     L|1|N
  Frames: 9, trusted: 9, frame warnings: 0

Message 1: results
  Delimiters    field |  repeat \  component ^  escape &
  Sender (H.5)  not sent
  Other fields  H.3 FIXTURE-HOST, H.4 MOCK-CHEM^ModelC^2
  Patient       practice ID PRA85979089, laboratory ID LAB85711132
  Order         specimen ACC45131375, priority R

  Test  Value  Units    Reference     Flag            Status
  TSH   0.70   mIU/L    0.40 to 4.50  N normal        F final
  CREA  0.5    mg/dL    0.6 to 1.3    L below-normal  F final
  WBC   14.5   10*3/uL  4.5 to 11.0   H above-normal  F final
  HGB   10.8   g/dL     12.0 to 17.5  L below-normal  F final
  Comment on HGB: Placeholder result comment for conformance testing.
  Active final results: 4 of 4

Record warnings: 0
```

Every frame's checksum is verified before its record is parsed. The flag and status columns show the
code the analyzer sent beside the meaning `@cosyte/astm` gives it, and `Active final results` counts
the results whose status is a plain `F`: a correction or a cancellation never counts. The sender reads
`not sent` because of where `@cosyte/synth` writes it: see [Limits](#limits).

## Test

```bash
npm test
```

The test runs `src/main.js` and checks the frame summary and one table row per result, with the
expected values read from the parsed upload. It then checks that the framed upload and its unframed
twin from `@cosyte/synth` parse to the same results, that each row carries the value, units, range,
flag and status its result record sent, and that a frame whose checksum fails is dropped before the
record parser, leaving a frame warning and one result fewer.

## How it works

1. `generateAstmResultFramed({ seed: 1033, resultCount: 4 })` from `@cosyte/synth/astm` builds the
   records through `@cosyte/astm`'s `buildAstmMessage` and frames them with `composeAstmFrames`. Each
   record travels in its own frame: `<STX>`, a frame number, the record text, `<ETX>`, a checksum (the
   sum of the bytes from the frame number through `<ETX>`, modulo 256, as two hex digits) and
   `<CR><LF>`. Frame numbers run 1 to 7 and wrap to 0.
2. `parseFramedAstm(bytes)` decodes the frames, checks each checksum and frame number, reassembles the
   records from trusted frames only and parses them. A frame that fails is kept in `frames` with
   `trusted: false` and reported in `frameWarnings` (`ASTM_FRAME_BAD_CHECKSUM`). Its record never
   reaches the parser, so `message.warnings` does not mention it: check both lists.
3. `messages(message)` splits the stream at each `H` header, so a patient is only paired with the
   results of its own message, and `classifyMessage(m.records).kind` says what the message is. A host
   query (a `Q` record) asks the LIS for work and is never a result set.
4. Each row comes from the typed result model: `universalTestId.localCode` (component 4, the code
   analyzers send), `value` and `units` verbatim, `range` with its bounds kept as text, `flag` with its
   meaning (an unrecognized flag reads `undefined`, never `normal`) and `status` (only a plain `F` is
   `isActiveFinal`). `commentsFor(message, result)` returns the comments attached to a result.
5. `@cosyte/astm` models the header's delimiters and leaves the other header fields in `header.fields`,
   where `fields[i]` is field H.(i + 1). `headerFields` lists the populated ones, and the sender is read
   from H.5, where E1394 puts the sender name or ID.

The code is in [`src/results.js`](src/results.js) and [`src/main.js`](src/main.js).

## Limits

- `@cosyte/synth` 0.0.9 writes its sender and analyzer identifiers into H.3 and H.4, which E1394
  defines as the message control ID and the access password, so the sender reads `not sent` and both
  identifiers are listed under other fields.
- `@cosyte/synth` 0.0.9 writes each test's name and LOINC after the local code, in components 5 and 6
  of the Universal Test ID, instead of components 2 and 1. `@cosyte/astm` models components 1 to 4 and
  keeps the rest verbatim in `universalTestId.components` without reading them as a name or a code, so
  the table shows the local code alone. A test name in component 2 prints beside the code.
- `@cosyte/synth` pairs values and flags without clinical coherence. With seed 1033 every flag agrees
  with its range; another seed can put an `H` on a value inside its range. The parser reports the flag
  the analyzer sent and never recomputes it.
- The upload is decoded as one byte stream after the fact. On a live serial or TCP link the analyzer
  also runs the ENQ, ACK, NAK and EOT exchange; `ltpReduce` in `@cosyte/astm` models the receiver's
  side of it and leaves the socket to you.

## Synthetic data

The upload comes from `@cosyte/synth`. The patient name comes from a fictional pool and the birth date
from its seeded generator; the practice, laboratory and specimen IDs carry the synthetic `PRA`, `LAB`
and `ACC` prefixes; the sender and analyzer names are fictional. The local test codes are invented and
the LOINC codes after them are public identifiers. None of it is real patient data or output from a
real instrument.

## Versions

The `@cosyte/*` versions are set in [`package.json`](package.json). After changing one, run
`npm install` to refresh `package-lock.json`, then `npm test`.

Need it integrated? [Talk to us](https://cosyte.com/contact).
