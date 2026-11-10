// @ts-check
// Integration, full suite: the fast slice's CLI pipelines over a seed sweep of every HL7 v2 kind and
// every input format.
import assert from "node:assert/strict";
import { test } from "node:test";
import { patientIdentifiers } from "../../src/make-fixtures.js";
import { HL7_KINDS, INPUTS, assertAbsent, cli, seedRange, writeInput } from "./support.js";

const SEEDS = seedRange(1, 12);

for (const [kind, generate] of Object.entries(HL7_KINDS)) {
  test(`${kind}, ${SEEDS.length} seeds: convert | validate - | redact -, each step exits 0 and leaks no PID value`, async () => {
    for (const seed of SEEDS) {
      const wire = generate(seed);
      const identifiers = patientIdentifiers(wire);
      const converted = await cli(["convert", writeInput(`sweep-${kind.replace("^", "-")}-${seed}.hl7`, wire), "--to", "fhir"]);
      // convert writes the Bundle either way and exits 1 when the transform reports an error. On the
      // synthetic ORU and SIU messages the one error is a resource the transform withheld rather than
      // emit invalid (no OBR-25 result status; an appointment start with no time zone).
      const errors = [...converted.stderr.matchAll(/^cosyte: convert: error (\S+) /gm)].map((match) => match[1]);
      assert.equal(converted.code, errors.length === 0 ? 0 : 1, `${kind} seed ${seed}: convert exited ${converted.code}`);
      assert.deepEqual([...new Set(errors)].filter((code) => code !== "TRANSFORM_RESOURCE_INVALID"), [], `${kind} seed ${seed}`);
      const validated = await cli(["validate", "-"], converted.stdout);
      assert.equal(validated.code, 0, `${kind} seed ${seed}: validate exited ${validated.code}`);
      const redacted = await cli(["redact", "-"], converted.stdout);
      assert.equal(redacted.code, 0, `${kind} seed ${seed}: redact exited ${redacted.code}`);
      assertAbsent(redacted.stdout, identifiers, `${kind} seed ${seed}: the redacted Bundle`);
      for (const stream of [converted.stderr, validated.stderr, redacted.stderr]) {
        assertAbsent(stream, identifiers, `${kind} seed ${seed}: the CLI's stderr`);
      }
    }
  });
}

for (const [name, { file, format, make }] of Object.entries(INPUTS)) {
  test(`${name}, ${SEEDS.length} seeds: validate exits 0 and fmt writes the same text back`, async () => {
    const options = format === undefined ? [] : ["--format", format];
    for (const seed of SEEDS) {
      const text = make(seed);
      const path = writeInput(`${seed}-${file}`, text);
      assert.equal((await cli(["validate", ...options, path])).code, 0, `${name} seed ${seed}: not valid`);
      const formatted = await cli(["fmt", ...options, path]);
      assert.equal(formatted.stdout.replace(/\n$/, ""), text, `${name} seed ${seed}: fmt changed the text`);
    }
  });
}
