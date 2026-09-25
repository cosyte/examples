// @ts-check
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseAstmRecords, results } from "@cosyte/astm";
import { generateAstmResult } from "@cosyte/synth/astm";
import { frameText, readUpload, resultRows, syntheticUpload } from "../src/results.js";

const run = promisify(execFile);
const starterDir = fileURLToPath(new URL("..", import.meta.url));
const SEED = 1033;
const RESULT_COUNT = 4;

/** @param {string} text */
const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("npm start decodes every frame and prints one table row per result", async () => {
  const { stdout } = await run(process.execPath, ["src/main.js"], { cwd: starterDir });
  const { frames, message } = readUpload(syntheticUpload(SEED, RESULT_COUNT));
  const count = frames.length;

  assert.match(stdout, new RegExp(`^  Frames: ${count}, trusted: ${count}, frame warnings: 0$`, "m"));
  assert.match(stdout, /^Message 1: results$/m);
  for (const result of results(message)) {
    const { localCode, testName } = result.universalTestId ?? {};
    const cells = [[localCode, testName].filter(Boolean).join(" "), result.value ?? "", result.units ?? ""];
    assert.match(stdout, new RegExp(`^  ${cells.map(literal).join("\\s+")}\\s`, "m"));
  }
  assert.match(stdout, new RegExp(`^  Active final results: ${RESULT_COUNT} of ${RESULT_COUNT}$`, "m"));
  assert.match(stdout, /^Record warnings: 0$/m);
});

test("the frame layer is transparent: framed and raw twins parse to the same results", () => {
  const { frames, frameWarnings, message } = readUpload(syntheticUpload(SEED, RESULT_COUNT));
  const raw = parseAstmRecords(generateAstmResult({ seed: SEED, resultCount: RESULT_COUNT }));
  const summary = (/** @type {import("@cosyte/astm").AstmMessage} */ m) =>
    results(m).map((r) => [r.universalTestId?.localCode, r.value, r.units, r.flag?.raw, r.status.raw]);

  assert.ok(frames.length > 0 && frames.every((frame) => frame.trusted && frame.checksum.valid));
  assert.deepEqual(frameWarnings, []);
  assert.deepEqual(message.warnings, []);
  assert.equal(message.records.length, raw.records.length);
  assert.deepEqual(summary(message), summary(raw));
});

test("each row carries the values the result record sent, read through the typed model", () => {
  const { message, messages } = readUpload(syntheticUpload(SEED, RESULT_COUNT));
  const [only] = messages;
  const rows = resultRows(message, only.results);

  assert.equal(messages.length, 1);
  assert.equal(rows.length, RESULT_COUNT);
  only.results.forEach((result, i) => {
    // fields[i] is R.(i + 1): R.4 value, R.5 units, R.6 range, R.7 flag, R.9 status.
    const [value, units, range, flag, , status] = result.fields.slice(3, 9).map((field) => field.raw);
    assert.equal(rows[i].value, value);
    assert.equal(rows[i].units, units);
    if (/^[\d.]+-[\d.]+$/.test(range)) assert.equal(rows[i].range, range.replace("-", " to "));
    assert.equal(rows[i].flag.split(" ")[0], flag);
    assert.equal(result.flag?.recognized, true);
    assert.equal(rows[i].status.split(" ")[0], status);
    assert.equal(rows[i].activeFinal, status === "F");
  });
});

test("a frame that fails its checksum never reaches the results", () => {
  const bytes = syntheticUpload(SEED, RESULT_COUNT);
  const clean = readUpload(bytes);
  const target = results(clean.message)[1];
  const frame = clean.frames.find((f) => frameText(f).startsWith(`R|${target.seq}|`));
  assert.ok(frame, "the second result travels in its own frame");

  // Flip one bit in the record text (after STX and the frame number), leaving the checksum as sent.
  const corrupted = Uint8Array.from(bytes);
  corrupted[frame.byteOffset + 4] ^= 0x01;

  const { frames, frameWarnings, message } = readUpload(corrupted);
  const codes = (/** @type {import("@cosyte/astm").AstmMessage} */ m) =>
    results(m).map((r) => r.universalTestId?.localCode);
  assert.equal(frames.filter((f) => !f.trusted).length, 1);
  assert.deepEqual(
    frameWarnings.map((warning) => warning.code),
    ["ASTM_FRAME_BAD_CHECKSUM"],
  );
  assert.deepEqual(
    codes(message),
    codes(clean.message).filter((code) => code !== target.universalTestId?.localCode),
  );
});
