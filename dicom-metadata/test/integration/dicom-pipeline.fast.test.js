// @ts-check
// Integration, fast slice: a synthetic DICOM Part 10 header, round-tripped through @cosyte/dicom,
// de-identified by @cosyte/deid, and the de-identified bytes round-tripped again.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDicom } from "@cosyte/dicom";
import { deidentifyDicom } from "@cosyte/deid/dicom";
import { syntheticCtHeader } from "../../src/part10.js";
import { checkDeid, checkRoundTrip, checkUid } from "./support.js";

test("the synthetic header round-trips byte for byte with the same metadata", () => {
  checkRoundTrip(syntheticCtHeader(), "synthetic CT header");
});

test("de-identified, the header round-trips, keeps no identifying value, and gets new valid UIDs", () => {
  const original = checkRoundTrip(syntheticCtHeader(), "original");
  const uidMap = new Map();
  const first = checkDeid(syntheticCtHeader(), uidMap, "first pass");
  for (const [name, uid] of [
    ["SOP Instance UID", first.sopInstanceUid],
    ["Study Instance UID", first.studyInstanceUid],
    ["Series Instance UID", first.seriesInstanceUid],
  ]) {
    checkUid(uid, name);
  }
  assert.notEqual(first.studyInstanceUid, original.study.instanceUid);
  assert.notEqual(first.seriesInstanceUid, original.series.instanceUid);
  assert.notEqual(first.sopInstanceUid, original.image.sopInstanceUid);

  // The remapping is derived from the original UID, so a second pass, with this map or a new one,
  // gives the same UIDs and the files of one study stay linked.
  assert.deepEqual(checkDeid(syntheticCtHeader(), uidMap, "second pass, same map"), first);
  assert.deepEqual(checkDeid(syntheticCtHeader(), new Map(), "a new map"), first);
});

test(
  "the De-identification Method the pass records fits the 64-character LO limit",
  {
    todo:
      "@cosyte/deid 0.1.5 writes (0012,0063) as one 113-character Value, and @cosyte/dicom reports " +
      "DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH",
  },
  () => {
    const { dataset, warnings } = deidentifyDicom(parseDicom(syntheticCtHeader()));
    assert.deepEqual(
      warnings.map((warning) => warning.code).filter((code) => code === "DICOM_DEIDENT_METHOD_VALUE_OVER_LENGTH"),
      [],
    );
    const method = dataset.get("00120063")?.value;
    assert.ok(method?.kind === "strings" && method.values.every((value) => value.length <= 64));
  },
);
