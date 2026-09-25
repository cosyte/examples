// @ts-check
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseHL7 } from "@cosyte/hl7";
import { SEED, patientIdentifiers, syntheticAdmit } from "../src/make-fixtures.js";

const run = promisify(execFile);
const starterDir = fileURLToPath(new URL("..", import.meta.url));
const out = (/** @type {string} */ name) => join(starterDir, "out", name);
const cosyte = join(starterDir, "node_modules", ".bin", "cosyte");
// Run the tour and the CLI on the same Node as this test.
const env = { ...process.env, PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}` };

// Expectations come from the synthetic input, read with @cosyte/hl7, not from pasted output.
const wire = syntheticAdmit(SEED);
const input = parseHL7(wire);
const segments = wire.split("\r").filter(Boolean);

/** @type {string} */
let tour = "";
before(async () => {
  // execFile rejects on a non-zero exit, so this also asserts that the tour exits 0.
  ({ stdout: tour } = await run("bash", ["tour.sh"], { cwd: starterDir, env }));
});

test("every step echoes its command and exits 0", () => {
  const commands = [
    "cosyte --version",
    "node src/make-fixtures.js out",
    "cosyte parse out/adt-a01.hl7 > out/adt-a01.parsed.json",
    "cosyte inspect out/adt-a01.hl7",
    "cosyte validate out/adt-a01.hl7",
    "cosyte convert out/adt-a01.hl7 --to fhir > out/adt-a01.fhir.json",
    "cosyte inspect out/adt-a01.fhir.json",
  ];
  for (const command of commands) assert.ok(tour.includes(`\n$ ${command}\n`), `missing: $ ${command}`);
  assert.deepEqual(tour.match(/^exit \d+$/gm), commands.map(() => "exit 0"));
  const cliManifest = join(starterDir, "node_modules", "@cosyte", "cli", "package.json");
  const { version } = JSON.parse(readFileSync(cliManifest, "utf8"));
  assert.ok(tour.includes(`\n$ cosyte --version\n${version}\n`), "the tour did not run the installed cosyte");
  assert.equal(readFileSync(out("adt-a01.hl7"), "utf8"), wire);
});

test("parse: the typed JSON carries every segment and the patient's values", () => {
  const parsed = JSON.parse(readFileSync(out("adt-a01.parsed.json"), "utf8"));
  assert.equal(parsed.format, "hl7");
  assert.deepEqual(parsed.warnings, []);
  assert.deepEqual(
    parsed.model.segments.map((/** @type {{ name: string }} */ s) => s.name),
    segments.map((s) => s.slice(0, 3)),
  );
  const model = JSON.stringify(parsed.model);
  for (const value of patientIdentifiers(wire)) {
    assert.ok(model.includes(JSON.stringify(value)), "a PID value is missing from the parsed model");
  }
});

test("inspect: the parse summary names the message type and counts the segments", () => {
  const type = `${input.get("MSH.9.1")}\\^${input.get("MSH.9.2")}`;
  assert.match(tour, new RegExp(`^message type: ${type}$`, "m"));
  assert.match(tour, new RegExp(`^segments:\\s+${segments.length}$`, "m"));
  assert.match(tour, /^warnings:\s+0$/m);
});

test("validate: the verdict is valid", () => {
  assert.match(tour, /^cosyte: validate: hl7 is valid \(\d+ finding\(s\)\)$/m);
});

test("convert: a FHIR message Bundle whose Patient comes from PID", () => {
  assert.match(tour, /^cosyte: convert: hl7 → fhir OK \(\d+ finding\(s\)\)$/m);
  assert.match(tour, /^resource type: Bundle$/m);
  assert.match(tour, /^bundle type:\s+message$/m);

  const bundle = JSON.parse(readFileSync(out("adt-a01.fhir.json"), "utf8"));
  assert.equal(bundle.resourceType, "Bundle");
  assert.equal(bundle.type, "message");
  const resources = bundle.entry.map((/** @type {{ resource: any }} */ e) => e.resource);
  const types = resources.map((/** @type {{ resourceType: string }} */ r) => r.resourceType);
  for (const type of ["MessageHeader", "Patient", "Encounter"]) assert.ok(types.includes(type), `no ${type}`);

  const patient = resources.find((/** @type {{ resourceType: string }} */ r) => r.resourceType === "Patient");
  const dob = input.get("PID.7") ?? "";
  assert.equal(patient.name[0].family, input.get("PID.5.1"));
  assert.equal(patient.name[0].given[0], input.get("PID.5.2"));
  assert.equal(patient.birthDate, `${dob.slice(0, 4)}-${dob.slice(4, 6)}-${dob.slice(6, 8)}`);
  assert.equal(patient.identifier[0].value, input.get("PID.3.1"));
});

test("the CLI's value-free surfaces carry no patient identifier", async () => {
  const identifiers = patientIdentifiers(wire);
  assert.ok(identifiers.length >= 5, `expected the synthetic PID to carry identifiers, got ${identifiers.length}`);

  const adt = out("adt-a01.hl7");
  const surfaces = [
    (await run(cosyte, ["inspect", adt], { env })).stdout,
    (await run(cosyte, ["inspect", out("adt-a01.fhir.json")], { env })).stdout,
    (await run(cosyte, ["validate", adt], { env })).stderr,
    (await run(cosyte, ["convert", adt, "--to", "fhir"], { env })).stderr,
  ];
  for (const text of surfaces) {
    for (const value of identifiers) {
      assert.ok(!text.includes(value), "a PID identifier reached a value-free surface");
    }
  }
});
