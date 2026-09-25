// @ts-check
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { deidentifyMessage, patientIdentifiers, syntheticAdmit } from "../src/deid.js";

const run = promisify(execFile);
const starterDir = fileURLToPath(new URL("..", import.meta.url));

test("npm start prints the de-identified message and a value-free manifest", async () => {
  const { stdout } = await run(process.execPath, ["src/main.js"], { cwd: starterDir });

  assert.match(stdout, /De-identified \(Safe Harbor policy\):/);
  for (const [locus, category, disposition] of [
    ["PID-5", "NAMES", "removed"],
    ["PID-7", "DATES", "transformed"],
    ["PID-13", "PHONE", "removed"],
    ["PID-19", "SSN", "removed"],
  ]) {
    assert.match(stdout, new RegExp(`^  ${locus}\\s+${category}\\s+\\w+\\s+${disposition}\\b`, "m"));
  }
  assert.match(stdout, /Found in the de-identified message: 0/);
  assert.match(stdout, /Found in the manifest: 0/);
});

test("no PID identifier from the input survives de-identification", () => {
  const { input, output, manifest } = deidentifyMessage(syntheticAdmit(12345), "test-only-key");
  const identifiers = patientIdentifiers(input);

  assert.ok(identifiers.length >= 5, `expected the synthetic PID to carry identifiers, got ${identifiers.length}`);
  for (const value of identifiers) {
    assert.ok(!output.toString().includes(value), `an input identifier survived in the output`);
    assert.ok(!JSON.stringify(manifest).includes(value), `an input identifier appears in the manifest`);
  }
  // The date of birth keeps its year and nothing finer.
  assert.equal(output.get("PID.7"), input.get("PID.7")?.slice(0, 4));
});
