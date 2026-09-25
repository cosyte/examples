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
