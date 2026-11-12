---
id: starter-astm-lab-results
title: Decode an ASTM analyzer upload into a results table
sidebar_label: astm-lab-results
description: "An analyzer upload of ASTM E1394 records in E1381 frames decoded, every checksum checked, into a table of results with their flags and status."
---

# Decode an ASTM analyzer upload into a results table

The `astm-lab-results` starter decodes a synthetic analyzer upload, ASTM E1394 result records
carried in E1381 frames, and prints each frame's checksum verdict, the header, which patient and
order IDs were sent, and a results table read from the library's typed result model. It prints no
value that identifies the patient: a frame prints its record type and length, never its text, and a
free-text comment prints its length.

Libraries: [`@cosyte/astm`](https://docs.cosyte.com/astm/),
[`@cosyte/synth`](https://docs.cosyte.com/synth/).

## What it shows

- **Checksums before parsing.** `parseFramedAstm(bytes)` decodes the frames, checks each checksum
  and frame number, and reassembles records from trusted frames only. A frame that fails is reported
  in `frameWarnings` and its record never reaches the parser, so check both lists.
- **One message at a time.** `messages(message)` splits the stream at each `H` header, so a patient
  is only paired with the results of its own message, and `classifyMessage` says what each message
  is. A host query is never a result set.
- **The typed result.** Each row reads the local test code, the value and units verbatim, the
  reference range with its bounds kept as text, the flag with its meaning (an unrecognized flag reads
  `undefined`, never `normal`), and the status: only a plain `F` is an active final result.
- **Comments.** `commentsFor(message, result)` returns the comments attached to a result.
- **Reading without printing.** `src/main.js` reads the practice, laboratory and specimen IDs into
  variables, with their synthetic values in comments.

## Run it

From a clone of [cosyte/examples](https://github.com/cosyte/examples), on Node 22 or later:

```bash
cd examples/astm-lab-results
npm ci
npm start
```

`npm test` runs the starter and checks the frame summary and one table row per result, with the
expected values read from the parsed upload, and that the output holds no patient ID, name or birth
date, no specimen ID, no comment text and no whole record. It checks that the framed upload and its unframed twin
parse to the same results, and that a frame whose checksum fails is dropped before the record
parser, leaving a frame warning and one result fewer.

## Before you build on it

- On the 0.1 line, `@cosyte/synth` writes its sender into header fields H.3 and H.4 rather than
  H.5, so the sender reads `not sent`, and writes each test's name and LOINC in components 5 and 6 of
  the Universal Test ID, so the table shows the local code alone.
- `@cosyte/synth` pairs values and flags without clinical coherence. The parser reports the flag the
  analyzer sent and never recomputes it.
- The upload is decoded as one byte stream after the fact. On a live link the analyzer also runs the
  ENQ, ACK, NAK and EOT exchange; `ltpReduce` in `@cosyte/astm` models the receiver's side of it and
  leaves the socket to you.

## Expected output

What `npm start` prints, as the starter's README gives it. This section and the next are generated from the starter by `scripts/docs-content.mjs`, and CI fails when they no longer match it.

```text
Synthetic E1381-framed upload from @cosyte/synth (seed 1033), 494 bytes:
  Frame  End  Checksum  Record
  1      ETX  05 ok     H, 37 characters
  2      ETX  26 ok     P, 60 characters
  3      ETX  1C ok     O, 47 characters
  4      ETX  DD ok     R, 55 characters
  5      ETX  ED ok     R, 52 characters
  6      ETX  41 ok     R, 55 characters
  7      ETX  B4 ok     R, 52 characters
  0      ETX  CA ok     C, 59 characters
  1      ETX  04 ok     L, 5 characters
  Frames: 9, trusted: 9, frame warnings: 0

Message 1: results
  Delimiters    field |  repeat \  component ^  escape &
  Sender (H.5)  not sent
  Other fields  H.3 FIXTURE-HOST, H.4 MOCK-CHEM^ModelC^2
  Patient       practice ID and laboratory ID sent
  Order         specimen ID sent, priority R

  Test  Value  Units    Reference     Flag            Status
  TSH   0.70   mIU/L    0.40 to 4.50  N normal        F final
  CREA  0.5    mg/dL    0.6 to 1.3    L below-normal  F final
  WBC   14.5   10*3/uL  4.5 to 11.0   H above-normal  F final
  HGB   10.8   g/dL     12.0 to 17.5  L below-normal  F final
  Comment on HGB: 51 characters
  Active final results: 4 of 4

Record warnings: 0
```

## Files

The starter's code, every file of `astm-lab-results/` as this release holds it, except its README, its lockfile and its tests, which are in the repository: [astm-lab-results on GitHub](https://github.com/cosyte/examples/tree/main/astm-lab-results).

### package.json

```json title="astm-lab-results/package.json"
{
  "name": "cosyte-example-astm-lab-results",
  "version": "0.0.0",
  "private": true,
  "description": "Decode a synthetic E1381-framed ASTM E1394 result upload with @cosyte/astm and print the results table.",
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
    "@cosyte/astm": "^0.1.0",
    "@cosyte/synth": "^0.1.0"
  }
}
```

### src/main.js

```js title="astm-lab-results/src/main.js"
// @ts-check
import { frameText, headerFields, messageKind, readUpload, resultRows, syntheticUpload } from "./results.js";

const SEED = 1033;
const RESULT_COUNT = 4;

/** @param {string} label @param {string} value */
const line = (label, value) => console.log(`  ${label.padEnd(14)}${value}`);

/**
 * Print rows of cells as aligned columns.
 *
 * @param {string[][]} rows
 */
function printTable(rows) {
  const widths = rows[0].map((_, column) => Math.max(...rows.map((cells) => cells[column].length)));
  for (const cells of rows) {
    console.log(`  ${cells.map((cell, column) => cell.padEnd(widths[column])).join("  ").trimEnd()}`);
  }
}

/**
 * The checksum the frame carried, as two hex digits, and whether it matched the bytes.
 *
 * @param {import("@cosyte/astm").AstmFrame} frame
 */
const checksum = ({ checksum: { declared, valid } }) =>
  `${(declared ?? 0).toString(16).toUpperCase().padStart(2, "0")} ${valid ? "ok" : "bad"}`;

const bytes = syntheticUpload(SEED, RESULT_COUNT);
const { message, frames, frameWarnings, messages } = readUpload(bytes);

// Nothing below prints a value that identifies a patient, synthetic or not: an example that logs a
// patient record teaches a pipeline to log one. A frame prints its record type and length, never its
// text, and a free-text comment prints its length.
/** @param {string} text */
const characters = (text) => `${text.length} characters`;

// The frame layer: one ETX-closed frame per record here, numbered 1 to 7 and then wrapping to 0.
console.log(`Synthetic E1381-framed upload from @cosyte/synth (seed ${SEED}), ${bytes.length} bytes:`);
printTable([
  ["Frame", "End", "Checksum", "Record"],
  ...frames.map((frame) => {
    const text = frameText(frame);
    return [String(frame.frameNumber), frame.terminator ?? "none", checksum(frame), `${text.charAt(0)}, ${characters(text)}`];
  }),
]);
const trusted = frames.filter((frame) => frame.trusted).length;
console.log(`  Frames: ${frames.length}, trusted: ${trusted}, frame warnings: ${frameWarnings.length}`);

// The record layer: one entry per H ... L message in the stream.
for (const m of messages) {
  const { field, repeat, component, escape } = m.header.delimiters;
  const fields = headerFields(m.header);
  const sender = fields.find(({ position }) => position === 5);
  const others = fields.filter(({ position }) => position !== 5);
  const patient = m.patient;

  console.log(`\nMessage ${m.index + 1}: ${messageKind(m)}`);
  line("Delimiters", `field ${field}  repeat ${repeat}  component ${component}  escape ${escape}`);
  line("Sender (H.5)", sender?.text ?? "not sent");
  line("Other fields", others.map(({ position, text }) => `H.${position} ${text}`).join(", ") || "none");
  // The patient's and the specimen's identifiers are read, never printed. The values in these comments
  // are synthetic.
  const practiceId = patient?.practiceAssignedId; // "PRA85979089", synthetic
  const laboratoryId = patient?.laboratoryAssignedId; // "LAB85711132", synthetic
  const ids = [practiceId && "practice ID", laboratoryId && "laboratory ID"].filter(Boolean);
  line("Patient", `${ids.join(" and ") || "no ID"} sent`);
  for (const order of m.orders) {
    const specimenId = order.specimenId; // "ACC45131375", synthetic
    line("Order", `specimen ID ${specimenId ? "sent" : "not sent"}, priority ${order.priority}`);
  }

  const rows = resultRows(message, m.results);
  console.log("");
  printTable([
    ["Test", "Value", "Units", "Reference", "Flag", "Status"],
    ...rows.map((row) => [row.test, row.value, row.units, row.range, row.flag, row.status]),
  ]);
  for (const row of rows) for (const text of row.comments) console.log(`  Comment on ${row.test}: ${characters(text)}`);
  console.log(`  Active final results: ${rows.filter((row) => row.activeFinal).length} of ${rows.length}`);
}

console.log(`\nRecord warnings: ${message.warnings.length}`);
```

### src/results.js

```js title="astm-lab-results/src/results.js"
// @ts-check
import { classifyMessage, commentsFor, messages, parseFramedAstm } from "@cosyte/astm";
import { generateAstmResultFramed } from "@cosyte/synth/astm";

/**
 * Build a synthetic result upload as an analyzer sends it over a serial line: ASTM E1394 records
 * (header, patient, order, results, comment, terminator) inside E1381 frames, each with a frame number
 * and a modulo-256 checksum. The same seed gives the same bytes on every machine.
 *
 * @param {number} seed
 * @param {number} resultCount
 * @returns {Uint8Array}
 */
export function syntheticUpload(seed, resultCount) {
  return generateAstmResultFramed({ seed, resultCount });
}

/**
 * Decode the frames and parse the records they carry. Only trusted frames (terminated, in sequence,
 * checksum verified) are reassembled, so a frame that fails its checksum never reaches the record
 * parser. `messages` splits the stream at each header, so a patient is only ever paired with the
 * results of its own message.
 *
 * @param {Uint8Array} bytes
 */
export function readUpload(bytes) {
  const { message, frames, frameWarnings } = parseFramedAstm(bytes);
  return { message, frames, frameWarnings, messages: messages(message) };
}

/**
 * The record text a frame carries, without its CR record terminator.
 *
 * @param {import("@cosyte/astm").AstmFrame} frame
 */
export function frameText(frame) {
  return Buffer.from(frame.text).toString("latin1").replace(/\r$/, "");
}

/**
 * The populated header fields by their E1394 position (H.3 onward). @cosyte/astm models the header's
 * delimiters; every other header field is read from `fields`, where `fields[i]` is field H.(i + 1).
 *
 * @param {import("@cosyte/astm").HeaderRecord} header
 * @returns {{ position: number, text: string }[]}
 */
export function headerFields(header) {
  return header.fields
    .map((field, index) => ({ position: index + 1, text: field.raw }))
    .filter(({ position, text }) => position >= 3 && text !== "");
}

/**
 * What one message is: `results`, `orders`, `host-query` or `indeterminate`. A host query asks the LIS
 * for work and is never a result set, so gate on this before you file anything.
 *
 * @param {import("@cosyte/astm").AstmStreamMessage} m
 */
export function messageKind(m) {
  return classifyMessage(m.records).kind;
}

/**
 * One row per result, from the typed result model: the test's local code (Universal Test ID component
 * 4), the value and units verbatim, the reference range as parsed bounds, the abnormal flag and result
 * status with the meanings the library assigns to them, and any comments attached to the result.
 *
 * @param {import("@cosyte/astm").AstmMessage} message the parsed stream, for comment lookup
 * @param {readonly import("@cosyte/astm").ResultRecord[]} results
 */
export function resultRows(message, results) {
  return results.map((result) => {
    const test = result.universalTestId;
    return {
      test: [test?.localCode ?? "?", test?.testName].filter(Boolean).join(" "),
      value: result.value ?? "",
      units: result.units ?? "",
      range: describeRange(result.range),
      flag: result.flag ? `${result.flag.raw} ${result.flag.meaning}` : "none",
      status: `${result.status.raw ?? "-"} ${result.status.meaning}`,
      activeFinal: result.status.isActiveFinal,
      comments: commentsFor(message, result).map((comment) => comment.text ?? ""),
    };
  });
}

/** @param {import("@cosyte/astm").ReferenceRange | undefined} range */
function describeRange(range) {
  if (range === undefined) return "none";
  if (range.kind === "closed") return `${range.low} to ${range.high}`;
  if (range.kind === "open-low") return `< ${range.high}`;
  if (range.kind === "open-high") return `> ${range.low}`;
  return `${range.raw} (not parsed)`;
}
```
