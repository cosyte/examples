---
id: starter-dicom-metadata
title: Read DICOM metadata and de-identify the header
sidebar_label: dicom-metadata
description: "DICOM Part 10 metadata read from a synthetic file, then the header de-identified, written back and read again, with a value-free manifest."
---

# Read DICOM metadata and de-identify the header

The `dicom-metadata` starter reads the patient, study and series metadata of a synthetic DICOM Part
10 file, then de-identifies the header and prints the value-free manifest of what it changed.

Libraries: [`@cosyte/dicom`](https://docs.cosyte.com/dicom/),
[`@cosyte/deid`](https://docs.cosyte.com/deid/).

## What it shows

- **Reading Part 10.** `parseDicom(bytes)` from `@cosyte/dicom` parses the file, and the typed views
  (`fileMeta`, `patient`, `study`, `series`, `image`) leave a missing value `undefined` rather than
  substituting a default.
- **De-identifying the header.** `deidentifyDicom(dataset, { uidMap })` from `@cosyte/deid/dicom`
  applies the PS3.15 Annex E Basic Application Level Confidentiality Profile and returns the
  value-free manifest `@cosyte/deid` produces for every format. The input dataset is not changed.
- **What a recipient reads.** `serializeDicom` writes the de-identified dataset back to Part 10, and
  `parseDicom` reads those bytes again, so the printed header is the one a recipient would read.
- **One UID map per study.** Share one `uidMap` across every file of a study, so the replacement UIDs
  agree from file to file. The map links the output back to the source: keep it private.
- **A check you can keep.** `src/main.js` searches the written bytes and the manifest for every
  identifying value read from the input, and exits 1 if one is found.

## Run it

From a clone of [cosyte/examples](https://github.com/cosyte/examples), on Node 22 or later:

```bash
cd examples/dicom-metadata
npm ci
npm start
```

The synthetic file is built in memory on every run; nothing is written to disk. The output is the
same on every run.

`npm test` runs the starter and checks the metadata lines against the values parsed from the
synthetic file. It de-identifies the header in process and checks that no identifying value from the
input appears in the written file or in the manifest, that each UID is replaced and recorded in the
shared map, that the pass records itself as text and as a code, and that the data set is written in
ascending tag order.

## Before you build on it

- The output is transformed per the configured Safe Harbor policy. It is not certified as
  de-identified.
- This is metadata-only de-identification: pixels are never inspected. For an object whose Pixel Data
  is not marked `BurnedInAnnotation` `NO`, `burnedInAnnotationHazard` is `true`: do not release it
  before a pixel-capable review.
- `@cosyte/dicom` has no public API for building a new object, so `src/part10.js` writes the
  synthetic file's bytes itself.
- On the 0.1 line of `@cosyte/deid`, the De-identification Method text is longer than an `LO` value
  allows, so `@cosyte/dicom` reports `DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH`.

## Expected output

What `npm start` prints, as the starter's README gives it. This section and the next are generated from the starter by `scripts/docs-content.mjs`, and CI fails when they no longer match it.

```text
Synthetic CT header (804 bytes of DICOM Part 10, built in memory):
  Transfer syntax      1.2.840.10008.1.2.1 (Explicit VR Little Endian)
  SOP class            1.2.840.10008.5.1.4.1.1.2 (CT Image Storage)
  SOP instance UID     2.25.180278240445437908828124246322305359710
  Patient name         ZZTEST^SYNTHETIC
  Patient ID           ZZTEST-0001 (issuer EXAMPLE.ORG)
  Birth date           1970-01-01
  Sex                  O
  Study instance UID   2.25.10155276760012127015659500753591548111
  Study date           2020-01-02
  Accession number     ZZACC0001
  Modality             CT
  Series instance UID  2.25.91500837647300718321059351149439276398
  Parse warnings       none

De-identified header (962 bytes, read back from the written file):
  (0008,0016) SOPClassUID                              1.2.840.10008.5.1.4.1.1.2
  (0008,0018) SOPInstanceUID                           2.25.86704070274506178779869117891871399775162034538788250112726
  (0008,0020) StudyDate                                (empty)
  (0008,0030) StudyTime                                (empty)
  (0008,0050) AccessionNumber                          (empty)
  (0008,0060) Modality                                 CT
  (0008,0090) ReferringPhysicianName                   (empty)
  (0010,0010) PatientName                              (empty)
  (0010,0020) PatientID                                (empty)
  (0010,0030) PatientBirthDate                         (empty)
  (0010,0040) PatientSex                               (empty)
  (0012,0062) PatientIdentityRemoved                   YES
  (0012,0063) DeidentificationMethod                   Cosyte @cosyte/deid, PS3.15 Basic Application Level Confidentiality Profile (metadata only); policy "safe-harbor"
  (0012,0064) DeidentificationMethodCodeSequence       (sequence, 1 item)
  (0020,000D) StudyInstanceUID                         2.25.27220899364256410842694272346482303969957183573538923698291
  (0020,000E) SeriesInstanceUID                        2.25.76808116996479560595985857159634965361995450169669996222346
  (0020,0010) StudyID                                  (empty)
  (0020,0011) SeriesNumber                             1
  (0020,0013) InstanceNumber                           1
  (0028,0303) LongitudinalTemporalInformationModified  REMOVED

Manifest (value-free: locus, category, transform, disposition, code):
  (0008,0018) SOP Instance UID           OTHER_UNIQUE_ID pseudonymize transformed DEID_CATEGORY_PSEUDONYMIZED
  (0008,0020) Study Date                 DATES           redact       removed     DEID_CATEGORY_REMOVED
  (0008,0030) Study Time                 DATES           redact       removed     DEID_CATEGORY_REMOVED
  (0008,0050) Accession Number           OTHER_UNIQUE_ID redact       removed     DEID_CATEGORY_REMOVED
  (0008,0080) Institution Name           GEOGRAPHIC      redact       removed     DEID_CATEGORY_REMOVED
  (0008,0090) Referring Physician's Name NAMES           redact       removed     DEID_CATEGORY_REMOVED
  (0008,1030) Study Description          OTHER_UNIQUE_ID redact       removed     DEID_CATEGORY_REMOVED
  (0008,103e) Series Description         OTHER_UNIQUE_ID redact       removed     DEID_CATEGORY_REMOVED
  (0010,0010) Patient's Name             NAMES           redact       removed     DEID_CATEGORY_REMOVED
  (0010,0020) Patient ID                 MRN             redact       removed     DEID_CATEGORY_REMOVED
  (0010,0021) Issuer of Patient ID       MRN             redact       removed     DEID_CATEGORY_REMOVED
  (0010,0030) Patient's Birth Date       DATES           redact       removed     DEID_CATEGORY_REMOVED
  (0010,0040) Patient's Sex              OTHER_UNIQUE_ID redact       removed     DEID_CATEGORY_REMOVED
  (0020,000d) Study Instance UID         OTHER_UNIQUE_ID pseudonymize transformed DEID_CATEGORY_PSEUDONYMIZED
  (0020,000e) Series Instance UID        OTHER_UNIQUE_ID pseudonymize transformed DEID_CATEGORY_PSEUDONYMIZED
  (0020,0010) Study ID                   OTHER_UNIQUE_ID redact       removed     DEID_CATEGORY_REMOVED

Warnings from the de-identification pass: DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH
Burned-in annotation hazard: no
UIDs remapped: 3 (the map links output to source: keep it private)

Input identifiers checked: 12
Found in the de-identified file: 0
Found in the manifest: 0
```

## Files

The starter's code, every file of `dicom-metadata/` as this release holds it, except its README, its lockfile and its tests, which are in the repository: [dicom-metadata on GitHub](https://github.com/cosyte/examples/tree/main/dicom-metadata).

### package.json

```json title="dicom-metadata/package.json"
{
  "name": "cosyte-example-dicom-metadata",
  "version": "0.0.0",
  "private": true,
  "description": "Read the metadata of a synthetic DICOM Part 10 file with @cosyte/dicom, then de-identify the header with @cosyte/deid.",
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
    "@cosyte/dicom": "^0.1.0"
  }
}
```

### src/dicom.js

```js title="dicom-metadata/src/dicom.js"
// @ts-check
import { deidentifyDicom } from "@cosyte/deid/dicom";
import { Dictionary, parseDicom, serializeDicom } from "@cosyte/dicom";

/** @typedef {import("@cosyte/dicom").Dataset} Dataset */
/** @typedef {import("@cosyte/dicom").Element} Element */

/**
 * A UID with the name the DICOM registry gives it, for example "CT Image Storage".
 *
 * @param {string | undefined} uid
 */
function withName(uid) {
  if (uid === undefined) return undefined;
  const name = Dictionary.uid(uid)?.name;
  return name === undefined ? uid : `${uid} (${name})`;
}

/**
 * A DA value as YYYY-MM-DD when it is a valid date, otherwise as written.
 *
 * @param {import("@cosyte/dicom").DicomDate | undefined} date
 */
function isoDate(date) {
  if (date?.valid !== true) return date?.raw;
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

/**
 * A person name in its DICOM form, family^given^middle, with empty trailing parts dropped.
 *
 * @param {import("@cosyte/dicom").PersonName | undefined} name
 */
function personName(name) {
  const n = name?.alphabetic;
  return n && [n.familyName, n.givenName, n.middleName].join("^").replace(/\^+$/, "");
}

/**
 * The metadata a routing or indexing job reads, through @cosyte/dicom's typed views. A missing value
 * stays undefined: the views never substitute a default.
 *
 * @param {Dataset} dataset
 */
export function readMetadata(dataset) {
  const { fileMeta, patient, study, series, image } = dataset;
  const sopClass = dataset.get("00080016")?.value;
  return {
    transferSyntax: withName(fileMeta?.transferSyntaxUID),
    sopClass: withName(sopClass?.kind === "strings" ? sopClass.values[0] : undefined),
    sopInstanceUid: image.sopInstanceUid,
    patientName: personName(patient.name),
    patientId: patient.issuerOfId ? `${patient.id} (issuer ${patient.issuerOfId})` : patient.id,
    birthDate: isoDate(patient.birthDate),
    sex: patient.sex,
    studyInstanceUid: study.instanceUid,
    studyDate: isoDate(study.date),
    accessionNumber: study.accessionNumber,
    modality: series.modality,
    seriesInstanceUid: series.instanceUid,
  };
}

/**
 * An element's value as text, decoded by its VR. Dates and times print as written.
 *
 * @param {Element} element
 * @returns {string}
 */
export function displayValue(element) {
  const value = element.value;
  if (value.kind === "empty") return "(empty)";
  if (value.kind === "text") return value.value;
  if (value.kind === "binary") return `(${value.bytes.length} bytes)`;
  if (value.kind === "sequence") {
    const count = value.items.length;
    return `(sequence, ${count} item${count === 1 ? "" : "s"})`;
  }
  if (value.kind === "personName") return value.values.map(personName).join("\\");
  /** @type {readonly unknown[]} */
  const values = value.values;
  return values.map((v) => (typeof v === "object" && v !== null && "raw" in v ? v.raw : String(v))).join("\\");
}

/**
 * An element's value exactly as written in the file, without its padding, or "" when it is absent.
 *
 * @param {Element | undefined} element
 */
function writtenText(element) {
  return element === undefined ? "" : element.rawBytes.toString("latin1").replace(/[\0 ]+$/, "");
}

/**
 * The identifying values in a header, read from the parsed file exactly as they are written in it. The
 * check after de-identification searches the output bytes and the manifest for each of them.
 *
 * @param {Dataset} dataset
 * @returns {string[]}
 */
export function identifyingValues(dataset) {
  const tags = [
    "00080018", // SOP Instance UID
    "00080020", // Study Date
    "00080050", // Accession Number
    "00080080", // Institution Name
    "00080090", // Referring Physician's Name
    "00100010", // Patient's Name
    "00100020", // Patient ID
    "00100021", // Issuer of Patient ID
    "00100030", // Patient's Birth Date
    "0020000D", // Study Instance UID
    "0020000E", // Series Instance UID
    "00200010", // Study ID
  ];
  return tags.map((tag) => writtenText(dataset.get(tag))).filter((value) => value !== "");
}

/**
 * De-identify a parsed header with @cosyte/deid's DICOM adapter, which applies @cosyte/dicom's PS3.15
 * Annex E Basic Profile. We write the result to Part 10 bytes and parse those bytes again, so what we
 * print and check is what a recipient would read. The input dataset is never changed.
 *
 * Pass the same `uidMap` for every file of a study to keep the remapped UIDs consistent across them.
 *
 * @param {Dataset} input
 * @param {Map<string, string>} [uidMap]
 */
export function deidentifyHeader(input, uidMap = new Map()) {
  const { dataset, manifest, warnings, burnedInAnnotationHazard } = deidentifyDicom(input, { uidMap });
  const bytes = serializeDicom(dataset);
  return { bytes, output: parseDicom(bytes), manifest, warnings, burnedInAnnotationHazard };
}
```

### src/main.js

```js title="dicom-metadata/src/main.js"
// @ts-check
import { Dictionary, parseDicom } from "@cosyte/dicom";
import { deidentifyHeader, displayValue, identifyingValues, readMetadata } from "./dicom.js";
import { syntheticCtHeader } from "./part10.js";

// parseDicom takes the bytes of a Part 10 file: here a synthetic one we build in memory, in your
// integration a file you received.
const part10 = syntheticCtHeader();
const input = parseDicom(part10);

const metadata = readMetadata(input);
console.log(`Synthetic CT header (${part10.length} bytes of DICOM Part 10, built in memory):`);
/** @type {[string, string | undefined][]} */
const rows = [
  ["Transfer syntax", metadata.transferSyntax],
  ["SOP class", metadata.sopClass],
  ["SOP instance UID", metadata.sopInstanceUid],
  ["Patient name", metadata.patientName],
  ["Patient ID", metadata.patientId],
  ["Birth date", metadata.birthDate],
  ["Sex", metadata.sex],
  ["Study instance UID", metadata.studyInstanceUid],
  ["Study date", metadata.studyDate],
  ["Accession number", metadata.accessionNumber],
  ["Modality", metadata.modality],
  ["Series instance UID", metadata.seriesInstanceUid],
  ["Parse warnings", input.warnings.map((w) => w.code).join(", ") || "none"],
];
for (const [label, value] of rows) console.log(`  ${label.padEnd(20)} ${value ?? "(absent)"}`);

// One shared UID map per study keeps the remapped Study, Series and SOP Instance UIDs consistent.
const uidMap = new Map();
const { bytes, output, manifest, warnings, burnedInAnnotationHazard } = deidentifyHeader(input, uidMap);

console.log(`\nDe-identified header (${bytes.length} bytes, read back from the written file):`);
const header = output.elements().map((element) => ({
  tag: `(${element.tag.slice(0, 4)},${element.tag.slice(4)})`,
  keyword: Dictionary.lookup(element.tag)?.keyword ?? "",
  value: displayValue(element),
}));
const keywordWidth = Math.max(...header.map((row) => row.keyword.length));
for (const { tag, keyword, value } of header) {
  console.log(`  ${tag} ${keyword.padEnd(keywordWidth)}  ${value}`);
}

console.log("\nManifest (value-free: locus, category, transform, disposition, code):");
const width = Math.max(...manifest.map((entry) => entry.locus.length));
for (const { locus, category, transform, disposition, code } of manifest) {
  const cells = [category.padEnd(15), transform.padEnd(12), disposition.padEnd(11), code];
  console.log(`  ${locus.padEnd(width)} ${cells.join(" ")}`);
}

const warningCodes = warnings.map((w) => w.code).join(", ") || "none";
console.log(`\nWarnings from the de-identification pass: ${warningCodes}`);
const hazard = burnedInAnnotationHazard ? "yes, do not release before a pixel review" : "no";
console.log(`Burned-in annotation hazard: ${hazard}`);
console.log(`UIDs remapped: ${uidMap.size} (the map links output to source: keep it private)`);

// A check you can keep in your own pipeline: no identifying value from the input survives in the
// written file, and the manifest names attributes and actions but never a value.
const outputText = bytes.toString("latin1");
const manifestText = JSON.stringify(manifest);
const identifiers = identifyingValues(input);
const leaked = identifiers.filter((value) => outputText.includes(value));
const inManifest = identifiers.filter((value) => manifestText.includes(value));

console.log(`\nInput identifiers checked: ${identifiers.length}`);
console.log(`Found in the de-identified file: ${leaked.length}`);
console.log(`Found in the manifest: ${inManifest.length}`);

if (leaked.length > 0 || inManifest.length > 0) process.exitCode = 1;
```

### src/part10.js

```js title="dicom-metadata/src/part10.js"
// @ts-check
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

// A small writer for one synthetic DICOM Part 10 file. @cosyte/dicom reads and re-writes Part 10
// (`parseDicom`, `serializeDicom`), but it has no public API for building a new object from scratch,
// so we write the few bytes ourselves. Every value below is invented.

export const EXPLICIT_VR_LITTLE_ENDIAN = "1.2.840.10008.1.2.1";
export const CT_IMAGE_STORAGE = "1.2.840.10008.5.1.4.1.1.2";

// RFC 9562 name-based UUID namespace for URLs. Our names are URLs under the reserved example.org.
const URL_NAMESPACE = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");

// These VRs have a 12-byte element header: two reserved bytes and a 32-bit length (PS3.5 section 7.1.2).
const LONG_FORM_VRS = new Set(["OB", "OD", "OF", "OL", "OV", "OW", "SQ", "SV", "UC", "UN", "UR", "UT", "UV"]);

/**
 * A UID under the 2.25 root: a UUID written as one decimal integer (PS3.5 section B.2). The UUID is
 * name-based (version 5), so the same name gives the same UID on every run and every machine.
 *
 * @param {string} name
 * @returns {string}
 */
export function uidFromName(name) {
  const url = `https://example.org/synthetic-dicom/${name}`;
  const uuid = createHash("sha1").update(URL_NAMESPACE).update(url).digest();
  uuid[6] = (uuid[6] & 0x0f) | 0x50; // version 5
  uuid[8] = (uuid[8] & 0x3f) | 0x80; // RFC 9562 variant
  return `2.25.${BigInt(`0x${uuid.subarray(0, 16).toString("hex")}`)}`;
}

/**
 * One data element in Explicit VR Little Endian: tag, VR, length, then the value padded to even length.
 *
 * @param {string} tag 8 hex digits, group then element, for example "00100010"
 * @param {string} vr
 * @param {string | number | Buffer} value
 * @returns {Buffer}
 */
function element(tag, vr, value) {
  let bytes;
  if (vr === "UL") {
    bytes = Buffer.alloc(4);
    bytes.writeUInt32LE(Number(value));
  } else if (Buffer.isBuffer(value)) {
    bytes = value;
  } else {
    // Text values are padded to an even length: a UID with a NUL byte, any other text with a space.
    const text = String(value);
    bytes = Buffer.from(text.length % 2 === 0 ? text : text + (vr === "UI" ? "\0" : " "), "latin1");
  }
  const header = Buffer.alloc(LONG_FORM_VRS.has(vr) ? 12 : 8);
  header.writeUInt16LE(parseInt(tag.slice(0, 4), 16), 0);
  header.writeUInt16LE(parseInt(tag.slice(4), 16), 2);
  header.write(vr, 4, "latin1");
  if (header.length === 12) header.writeUInt32LE(bytes.length, 8);
  else header.writeUInt16LE(bytes.length, 6);
  return Buffer.concat([header, bytes]);
}

/**
 * Build a synthetic CT header as a DICOM Part 10 file: a 128-byte preamble, "DICM", the File Meta group,
 * then the data set, every group in ascending tag order. It carries patient, study, series and instance
 * attributes and no Pixel Data.
 *
 * @returns {Buffer}
 */
export function syntheticCtHeader() {
  const sopInstanceUid = uidFromName("instance-1");
  const fileMeta = Buffer.concat([
    element("00020001", "OB", Buffer.from([0x00, 0x01])), // File Meta Information Version
    element("00020002", "UI", CT_IMAGE_STORAGE), // Media Storage SOP Class UID
    element("00020003", "UI", sopInstanceUid), // Media Storage SOP Instance UID
    element("00020010", "UI", EXPLICIT_VR_LITTLE_ENDIAN), // Transfer Syntax UID
    element("00020012", "UI", uidFromName("implementation")), // Implementation Class UID
  ]);
  const dataSet = [
    element("00080016", "UI", CT_IMAGE_STORAGE), // SOP Class UID
    element("00080018", "UI", sopInstanceUid), // SOP Instance UID
    element("00080020", "DA", "20200102"), // Study Date
    element("00080030", "TM", "093000"), // Study Time
    element("00080050", "SH", "ZZACC0001"), // Accession Number
    element("00080060", "CS", "CT"), // Modality
    element("00080080", "LO", "ZZTEST SYNTHETIC IMAGING"), // Institution Name
    element("00080090", "PN", "ZZDOCTOR^EXAMPLE"), // Referring Physician's Name
    element("00081030", "LO", "SYNTHETIC CT HEAD"), // Study Description
    element("0008103E", "LO", "SYNTHETIC AXIAL"), // Series Description
    element("00100010", "PN", "ZZTEST^SYNTHETIC"), // Patient's Name
    element("00100020", "LO", "ZZTEST-0001"), // Patient ID
    element("00100021", "LO", "EXAMPLE.ORG"), // Issuer of Patient ID
    element("00100030", "DA", "19700101"), // Patient's Birth Date
    element("00100040", "CS", "O"), // Patient's Sex
    element("0020000D", "UI", uidFromName("study-1")), // Study Instance UID
    element("0020000E", "UI", uidFromName("series-1")), // Series Instance UID
    element("00200010", "SH", "ZZSTUDY1"), // Study ID
    element("00200011", "IS", "1"), // Series Number
    element("00200013", "IS", "1"), // Instance Number
  ];
  return Buffer.concat([
    Buffer.alloc(128), // preamble
    Buffer.from("DICM", "latin1"),
    element("00020000", "UL", fileMeta.length), // File Meta Information Group Length
    fileMeta,
    ...dataSet,
  ]);
}
```
