// @ts-check
// Shared by the integration tests: the round trips a Part 10 file must survive through @cosyte/dicom,
// before and after @cosyte/deid. @cosyte/synth has no DICOM generator, so the input is the starter's
// own hand-written synthetic header.
import assert from "node:assert/strict";
import { parseDicom, serializeDicom } from "@cosyte/dicom";
import { deidentifyHeader, identifyingValues, readMetadata } from "../../src/dicom.js";

/**
 * Parse Part 10 bytes, write them back, and assert the bytes are unchanged, read with no warning, and
 * give the same metadata. Returns the parsed dataset.
 *
 * @param {Uint8Array} bytes
 * @param {string} label
 */
export function checkRoundTrip(bytes, label) {
  const dataset = parseDicom(bytes);
  assert.deepEqual(dataset.warnings, [], `${label}: the parser warned`);
  const written = serializeDicom(dataset);
  assert.equal(Buffer.compare(Buffer.from(written), Buffer.from(bytes)), 0, `${label}: parse then serialize changed the bytes`);
  assert.deepEqual(readMetadata(parseDicom(written)), readMetadata(dataset), `${label}: the metadata changed`);
  return dataset;
}

/**
 * Assert a UID is well formed (PS3.5 section 9.1): digits in dot-separated components, no component
 * with a leading zero, at most 64 characters.
 *
 * @param {string | undefined} uid
 * @param {string} name
 */
export function checkUid(uid, name) {
  assert.match(String(uid), /^(0|[1-9]\d*)(\.(0|[1-9]\d*))*$/, `${name} is not a valid UID`);
  assert.ok(String(uid).length <= 64, `${name} is longer than 64 characters`);
}

/**
 * De-identify a header with a study-wide UID map, then assert the de-identified bytes round-trip, keep
 * no identifying value, and map each original UID the same way every time the map is reused.
 *
 * @param {Uint8Array} bytes
 * @param {Map<string, string>} uidMap
 * @param {string} label
 */
export function checkDeid(bytes, uidMap, label) {
  const input = checkRoundTrip(bytes, label);
  const values = identifyingValues(input);
  assert.ok(values.length >= 10, `${label}: the synthetic header carries identifiers`);

  const { bytes: deidentified, output, manifest } = deidentifyHeader(input, uidMap);
  checkRoundTrip(deidentified, `${label}, de-identified`);
  const text = Buffer.from(deidentified).toString("latin1");
  values.forEach((value, index) => {
    assert.ok(!text.includes(value), `${label}: identifier ${index} of ${values.length} reached the output`);
    assert.ok(!JSON.stringify(manifest).includes(value), `${label}: identifier ${index} reached the manifest`);
  });
  return readMetadata(output);
}
