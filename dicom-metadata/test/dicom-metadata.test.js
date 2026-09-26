// @ts-check
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseDicom } from "@cosyte/dicom";
import { deidentifyHeader, displayValue, identifyingValues, readMetadata } from "../src/dicom.js";
import { EXPLICIT_VR_LITTLE_ENDIAN, syntheticCtHeader } from "../src/part10.js";

const run = promisify(execFile);
const starterDir = fileURLToPath(new URL("..", import.meta.url));

/** @param {string} text */
const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("npm start prints the metadata, the de-identified header and a clean check", async () => {
  const { stdout } = await run(process.execPath, ["src/main.js"], { cwd: starterDir });
  const metadata = readMetadata(parseDicom(syntheticCtHeader()));
  const { transferSyntax, sopClass, patientName, studyInstanceUid } = metadata;

  // The metadata lines carry the values read from the synthetic file.
  for (const value of [transferSyntax, sopClass, patientName, studyInstanceUid]) {
    assert.match(stdout, new RegExp(`^  .{20} ${literal(String(value))}$`, "m"));
  }
  // The de-identified header keeps the patient attributes empty and says it was de-identified.
  assert.match(stdout, /^ {2}\(0010,0010\) PatientName +\(empty\)$/m);
  assert.match(stdout, /^ {2}\(0012,0062\) PatientIdentityRemoved +YES$/m);
  assert.match(stdout, /^ {2}\(0012,0064\) DeidentificationMethodCodeSequence +\(sequence, 1 item\)$/m);
  assert.match(stdout, /^ {2}\(0028,0303\) LongitudinalTemporalInformationModified +REMOVED$/m);
  assert.match(stdout, /Found in the de-identified file: 0/);
  assert.match(stdout, /Found in the manifest: 0/);
});

test("the synthetic file parses without warnings, with UUID-derived UIDs", () => {
  const dataset = parseDicom(syntheticCtHeader());

  assert.deepEqual(dataset.warnings, []);
  assert.equal(dataset.fileMeta?.transferSyntaxUID, EXPLICIT_VR_LITTLE_ENDIAN);
  assert.equal(dataset.image.sopInstanceUid, dataset.fileMeta?.mediaStorageSOPInstanceUID);
  for (const uid of [dataset.image.sopInstanceUid, dataset.study.instanceUid, dataset.series.instanceUid]) {
    // PS3.5 section B.2: 2.25 followed by a 128-bit UUID as a decimal integer, at most 39 digits.
    assert.match(uid ?? "", /^2\.25\.[1-9]\d{0,38}$/);
  }
});

test("de-identification leaves no identifying value and remaps UIDs consistently", () => {
  const input = parseDicom(syntheticCtHeader());
  const uidMap = new Map();
  const { bytes, output, manifest, burnedInAnnotationHazard } = deidentifyHeader(input, uidMap);

  const identifiers = identifyingValues(input);
  assert.ok(identifiers.length >= 10, `expected identifiers in the header, got ${identifiers.length}`);
  for (const value of identifiers) {
    assert.ok(!bytes.toString("latin1").includes(value), "an input identifier survived in the output");
    assert.ok(!JSON.stringify(manifest).includes(value), "an input identifier appears in the manifest");
  }

  // The patient attributes are gone from the typed views; the modality survives.
  assert.equal(output.patient.name, undefined);
  assert.equal(output.patient.id, undefined);
  assert.equal(output.patient.birthDate, undefined);
  assert.equal(output.series.modality, input.series.modality);

  // Each UID is replaced, the shared map records the pair, and the File Meta agrees with the data set.
  for (const [before, after] of [
    [input.study.instanceUid, output.study.instanceUid],
    [input.series.instanceUid, output.series.instanceUid],
    [input.image.sopInstanceUid, output.image.sopInstanceUid],
  ]) {
    assert.ok(after !== undefined && after !== before, "a UID was not replaced");
    assert.equal(uidMap.get(before), after);
  }
  assert.equal(output.fileMeta?.mediaStorageSOPInstanceUID, output.image.sopInstanceUid);

  // A second file de-identified with the same map gets the same replacements, so a study stays linked.
  assert.equal(deidentifyHeader(input, uidMap).output.study.instanceUid, output.study.instanceUid);

  // The manifest names the Safe Harbor category of each patient attribute it acted on.
  /** @param {string} tag */
  const categoryAt = (tag) => manifest.find((entry) => entry.locus.startsWith(tag))?.category;
  assert.equal(categoryAt("(0010,0010)"), "NAMES");
  assert.equal(categoryAt("(0010,0020)"), "MRN");
  assert.equal(categoryAt("(0010,0030)"), "DATES");
  assert.equal(burnedInAnnotationHazard, false);

  // The pass records itself as text and as a code, marks the dates removed, and the written data set
  // is in ascending tag order.
  /** @param {import("@cosyte/dicom").Dataset | undefined} dataset @param {string} tag */
  const textAt = (dataset, tag) => {
    const element = dataset?.get(tag);
    return element === undefined ? undefined : displayValue(element);
  };
  assert.equal(textAt(output, "00120062"), "YES");
  const codes = output.get("00120064")?.value;
  const [method] = codes?.kind === "sequence" ? codes.items : [];
  assert.equal(textAt(method, "00080100"), "113100");
  assert.equal(textAt(method, "00080102"), "DCM");
  assert.equal(textAt(output, "00280303"), "REMOVED");
  const tags = output.elements().map((element) => element.tag);
  assert.deepEqual(tags, [...tags].sort(), "the written data set is in ascending tag order");
});
