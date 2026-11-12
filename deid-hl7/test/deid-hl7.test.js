// @ts-check
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { deidentifyMessage, patientIdentifiers, syntheticAdmit } from "../src/deid.js";

const run = promisify(execFile);
const starterDir = fileURLToPath(new URL("..", import.meta.url));

/** @param {string} text */
const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

test("npm start prints field counts, a value-free manifest and the residual list", async () => {
  const { stdout } = await run(process.execPath, ["src/main.js"], { cwd: starterDir });

  assert.match(stdout, /^ {2}PID {3}8 -> 5$/m);
  for (const [locus, category, disposition] of [
    ["MSH-7[0]", "DATES", "transformed"],
    ["EVN-2[0]", "DATES", "transformed"],
    ["PID-3[0]", "MRN", "removed"],
    ["PID-5", "NAMES", "removed"],
    ["PID-7", "DATES", "transformed"],
    ["PID-13", "PHONE", "removed"],
    ["PID-19", "SSN", "removed"],
  ]) {
    assert.match(stdout, new RegExp(`^  ${literal(locus)}\\s+${category}\\s+\\w+\\s+${disposition}\\b`, "m"));
  }
  assert.match(stdout, /^Unexamined residuals \(value-free: \d+ positions passed through without a rule\):$/m);
  assert.match(stdout, /Found in the de-identified message: 0/);
  assert.match(stdout, /Found in the manifest: 0/);
  assert.match(stdout, /Found in the residual list: 0/);
});

test("npm start prints no identifier from the message and no segment of it", async () => {
  const { stdout } = await run(process.execPath, ["src/main.js"], { cwd: starterDir });
  const wire = syntheticAdmit(12345);
  const { input, output } = deidentifyMessage(wire);

  for (const value of patientIdentifiers(input)) {
    assert.ok(!stdout.includes(value), "npm start printed an identifier from the input");
  }
  for (const segment of [...wire.split("\r"), ...output.toString().split("\r")].filter(Boolean)) {
    assert.ok(!stdout.includes(segment), `npm start printed a whole ${segment.slice(0, 3)} segment`);
  }
  assert.match(stdout, /^ {2}PID-7 {2}day -> year$/m);
});

test("no PID identifier from the input survives de-identification", () => {
  const { input, output, manifest, residuals } = deidentifyMessage(syntheticAdmit(12345));
  const identifiers = patientIdentifiers(input);

  assert.ok(identifiers.length >= 5, `expected the synthetic PID to carry identifiers, got ${identifiers.length}`);
  for (const value of identifiers) {
    assert.ok(!output.toString().includes(value), `an input identifier survived in the output`);
    assert.ok(!JSON.stringify(manifest).includes(value), `an input identifier appears in the manifest`);
    assert.ok(!JSON.stringify(residuals).includes(value), `an input identifier appears in the residual list`);
  }
  // The date of birth and the message and event timestamps keep their year and nothing finer.
  for (const path of ["PID.7", "MSH.7", "EVN.2"]) {
    assert.equal(output.get(path), input.get(path)?.slice(0, 4), `${path} keeps only its year`);
  }
});
