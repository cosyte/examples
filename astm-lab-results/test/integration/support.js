// @ts-check
// Shared by the integration tests: the round trips a synthetic ASTM upload must survive, framed and
// unframed, and what the results table reads before and after.
import assert from "node:assert/strict";
import { parseAstmRecords, serializeAstmRecords, serializeFramedAstm } from "@cosyte/astm";
import { generateAstmOrder, generateAstmResult } from "@cosyte/synth/astm";
import { messageKind, readUpload, resultRows, syntheticUpload } from "../../src/results.js";

/**
 * The seeds from `first` to `first + count - 1`.
 *
 * @param {number} first
 * @param {number} count
 * @returns {number[]}
 */
export function seedRange(first, count) {
  return Array.from({ length: count }, (_, index) => first + index);
}

/**
 * The results table of every message in a decoded upload.
 *
 * @param {ReturnType<typeof readUpload>} upload
 */
function tables(upload) {
  return upload.messages.map((m) => resultRows(upload.message, m.results));
}

/**
 * One synthetic result upload, framed as an analyzer sends it: decoded with every frame trusted,
 * framed again byte for byte, its record text equal to the unframed upload for the same seed, and the
 * same results table read back from the re-framed bytes.
 *
 * @param {number} seed
 * @param {number} resultCount
 */
export function checkResultUpload(seed, resultCount) {
  const label = `seed ${seed}, ${resultCount} results`;
  const bytes = syntheticUpload(seed, resultCount);
  const upload = readUpload(bytes);
  assert.deepEqual(upload.frameWarnings, [], `${label}: a frame warned`);
  assert.deepEqual(upload.message.warnings, [], `${label}: the record parser warned`);
  assert.deepEqual(upload.messages.map(messageKind), ["results"], `${label}: not one result message`);

  const reframed = serializeFramedAstm(upload.message);
  assert.equal(Buffer.compare(Buffer.from(reframed), Buffer.from(bytes)), 0, `${label}: re-framing changed the bytes`);

  const text = generateAstmResult({ seed, resultCount });
  assert.equal(serializeAstmRecords(upload.message), text, `${label}: the framed records differ from the unframed upload`);
  assert.equal(serializeAstmRecords(parseAstmRecords(text)), text, `${label}: the record text does not round-trip`);

  const again = readUpload(reframed);
  assert.equal(again.messages[0].results.length, resultCount, `${label}: a result went missing`);
  assert.deepEqual(tables(again), tables(upload), `${label}: the results table changed`);
}

/**
 * One synthetic order download: it round-trips and classifies as orders, never as results.
 *
 * @param {number} seed
 */
export function checkOrder(seed) {
  const text = generateAstmOrder({ seed });
  const message = parseAstmRecords(text);
  assert.deepEqual(message.warnings, [], `order seed ${seed}: the record parser warned`);
  assert.equal(serializeAstmRecords(message), text, `order seed ${seed}: the record text does not round-trip`);
  assert.equal(messageKind(/** @type {any} */ ({ records: message.records })), "orders", `order seed ${seed}: not classified as orders`);
}
