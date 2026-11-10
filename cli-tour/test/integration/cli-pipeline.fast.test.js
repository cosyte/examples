// @ts-check
// Integration, fast slice: the `cosyte` CLI from @cosyte/cli driven as a child process over synthetic
// input in every format it reads, its output piped from one command into the next and read back with
// the libraries.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseResource, resourceType, serializeResource } from "@cosyte/fhir";
import { parseHL7 } from "@cosyte/hl7";
import { HL7_KINDS, INPUTS, assertAbsent, cli, identifiersOf, telecomClaim, writeInput } from "./support.js";
import { patientIdentifiers } from "../../src/make-fixtures.js";

const SEED = 1;

test("convert piped into validate and into redact: a valid Bundle, then one with no PID identifier", async () => {
  const wire = HL7_KINDS["ADT^A01"](SEED);
  const identifiers = patientIdentifiers(wire);
  const file = writeInput("pipe-adt-a01.hl7", wire);

  const converted = await cli(["convert", file, "--to", "fhir"]);
  assert.equal(converted.code, 0, "convert failed");
  const bundle = JSON.parse(converted.stdout);
  const patient = bundle.entry.map((/** @type {any} */ entry) => entry.resource).find((/** @type {any} */ r) => r.resourceType === "Patient");
  assert.equal(patient.name[0].family, parseHL7(wire).get("PID.5.1"));

  const validated = await cli(["validate", "-"], converted.stdout);
  assert.equal(validated.code, 0, "the converted Bundle is not valid");
  assert.match(validated.stderr, /^cosyte: validate: fhir is valid/m);

  const redacted = await cli(["redact", "-"], converted.stdout);
  assert.equal(redacted.code, 0, "redact refused the converted Bundle");
  const { resource } = parseResource(redacted.stdout);
  assert.equal(resourceType(resource), "Bundle");
  assertAbsent(redacted.stdout, identifiers, "the redacted Bundle");
  for (const stream of [converted.stderr, validated.stderr, redacted.stderr]) {
    assertAbsent(stream, identifiers, "the CLI's stderr");
  }
  // The redacted Bundle validates too, in the next process down the pipe.
  assert.equal((await cli(["validate", "-"], serializeResource(resource))).code, 0);
});

for (const [name, { file, format, make }] of Object.entries(INPUTS)) {
  test(`${name}: validate exits 0, and fmt writes the same text back`, async () => {
    const text = make(SEED);
    const path = writeInput(file, text);
    const options = format === undefined ? [] : ["--format", format];

    const validated = await cli(["validate", ...options, path]);
    assert.equal(validated.code, 0, `validate exited ${validated.code}`);
    assert.match(validated.stderr, /is valid \(\d+ finding\(s\)\)$/m);

    const formatted = await cli(["fmt", ...options, path]);
    assert.equal(formatted.code, 0, `fmt exited ${formatted.code}`);
    // fmt ends its output with a newline after the last segment or closing tag.
    assert.equal(formatted.stdout.replace(/\n$/, ""), text, "fmt changed a spec-clean synthetic input");
  });
}

for (const [name, kind, input] of [
  ["HL7 v2 ORU^R01", "hl7", HL7_KINDS["ORU^R01"](SEED)],
  ["X12 835", "x12", INPUTS.x12835.make(SEED)],
  ["X12 837P", "x12", INPUTS.x12837.make(SEED)],
  ["C-CDA", "ccda", INPUTS.ccda.make(SEED)],
]) {
  test(`${name}: redact exits 1 and writes nothing when the policy blocks a locus, naming no value`, async () => {
    const identifiers = identifiersOf(kind, input);
    assert.ok(identifiers.length >= 2, "the input carries identifiers");
    const refused = await cli(["redact", writeInput(`blocked-${name.replace(/\W+/g, "-")}`, input)]);
    assert.equal(refused.code, 1);
    assert.equal(refused.stdout, "", "a partial de-identification was written");
    assert.match(refused.stderr, /DEID_LOCUS_BLOCKED/);
    assertAbsent(refused.stderr, identifiers, "the CLI's stderr");
  });
}

test("redact on ASTM, a format @cosyte/deid does not cover, exits 69 and writes nothing", async () => {
  const refused = await cli(["redact", writeInput("results-redact.astm", INPUTS.astm.make(SEED))]);
  assert.equal(refused.code, 69);
  assert.equal(refused.stdout, "");
});

test("map-codes translates a local code through a ConceptMap, and exits 1 on a code it does not map", async () => {
  // A hand-written ConceptMap from a fictional local lab code system to LOINC. A code is not PHI.
  const conceptMap = writeInput(
    "local-labs.conceptmap.json",
    JSON.stringify({
      resourceType: "ConceptMap",
      status: "draft",
      url: "https://example.org/fhir/ConceptMap/synthetic-local-labs",
      group: [
        {
          source: "https://example.org/fhir/CodeSystem/synthetic-local-labs",
          target: "http://loinc.org",
          element: [{ code: "K", target: [{ code: "2823-3", equivalence: "equivalent" }] }],
        },
      ],
    }),
  );
  const mapped = await cli(["map-codes", conceptMap, "--code", "K", "--json"]);
  assert.equal(mapped.code, 0);
  const { result } = JSON.parse(mapped.stdout);
  assert.equal(result.unmapped, false);
  assert.deepEqual(
    result.matches.map((/** @type {any} */ match) => [match.target.system, match.target.code, match.equivalence]),
    [["http://loinc.org", "2823-3", "equivalent"]],
  );

  const unmapped = await cli(["map-codes", conceptMap, "--code", "NOT-A-CODE", "--json"]);
  assert.equal(unmapped.code, 1);
  assert.equal(JSON.parse(unmapped.stdout).result.code, "TERM_TRANSLATE_UNMAPPED");
});

test(
  "an NCPDP Telecom B1 claim validates through the CLI",
  { todo: "@cosyte/cli 0.1.8 reads NCPDP as SCRIPT only: a Telecom claim is undetected (65), and --format ncpdp fails with NCPDP_SCRIPT_NOT_XML" },
  async () => {
    const result = await cli(["validate", "--format", "ncpdp", writeInput("claim.b1.ncpdp", telecomClaim(SEED))]);
    assert.equal(result.code, 0);
  },
);
