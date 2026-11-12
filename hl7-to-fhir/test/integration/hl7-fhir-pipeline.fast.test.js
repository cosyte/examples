// @ts-check
// Integration, fast slice: HL7 v2 from @cosyte/synth, parsed by @cosyte/hl7, converted by
// @cosyte/transform, validated by @cosyte/fhir, its codes and units checked by @cosyte/terminology,
// and the Bundle de-identified by @cosyte/deid. Public APIs only, every value synthetic.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseResource, resourceType, serializeResource } from "@cosyte/fhir";
import { deidentifyFhir } from "@cosyte/deid/fhir";
import { parseHL7 } from "@cosyte/hl7";
import { isUnknownSystem, resolveSystem, validateUcum } from "@cosyte/terminology";
import { convertToFhir } from "../../src/convert.js";
import {
  EXPECTED_BLOCKED_LOCI,
  KNOWN_UNRESOLVED_SYSTEMS,
  MESSAGE_KINDS,
  assertAbsent,
  blockedLoci,
  checkMessage,
  codedValues,
  patientValues,
  resourcesOf,
  seedRange,
  setField,
  validateEntries,
} from "./support.js";

const SEEDS = seedRange(1, 2);

for (const [kind, generate] of Object.entries(MESSAGE_KINDS)) {
  test(`${kind}: converts, validates, resolves its codes, and de-identifies with no identifier left`, () => {
    for (const seed of SEEDS) checkMessage(generate(seed), `${kind} seed ${seed}`);
  });
}

test("ORU^R01: one Observation per OBX, and a DiagnosticReport only when OBR-25 gives it a status", () => {
  const wire = MESSAGE_KINDS["ORU^R01"](SEEDS[0]);
  const message = parseHL7(wire);
  const obxCount = wire.split("\r").filter((segment) => segment.startsWith("OBX|")).length;

  for (const [label, text, status] of [
    ["as generated", wire, message.get("OBR.25") ?? ""],
    ["with OBR-25 F", setField(wire, "OBR", 25, "F"), "F"],
  ]) {
    const { bundle, issues } = convertToFhir(text);
    const json = JSON.parse(serializeResource(bundle));
    assert.equal(resourcesOf(json, "Observation").length, obxCount, `${label}: an OBX did not become an Observation`);
    const reports = resourcesOf(json, "DiagnosticReport");
    if (status === "") {
      // DiagnosticReport.status is required and nothing else grounds it, so the transform withholds
      // the report and says so rather than invent a status.
      assert.equal(reports.length, 0, `${label}: a DiagnosticReport was emitted with no status`);
      assert.ok(
        issues.some((issue) => issue.code === "TRANSFORM_RESOURCE_INVALID" && issue.v2Location === "OBR"),
        `${label}: the withheld report was not declared`,
      );
    } else {
      assert.equal(reports.length, 1, `${label}: no DiagnosticReport`);
      assert.equal(reports[0].status, "final");
    }
    for (const { type, issues: found } of validateEntries(bundle)) {
      assert.deepEqual(found.filter((issue) => issue.severity === "error" || issue.severity === "fatal"), [], `${label}: ${type}`);
    }
  }
});

test("ORU^R01: a unit the sender declares as UCUM reaches Quantity.code, and terminology accepts it", () => {
  const wire = MESSAGE_KINDS["ORU^R01"](SEEDS[0]);
  // Declare each OBX-6 unit as UCUM (CWE-3), the way a sender that codes its units writes it.
  const declared = wire
    .split("\r")
    .map((segment) => {
      if (!segment.startsWith("OBX|")) return segment;
      const fields = segment.split("|");
      fields[6] = `${fields[6]}^^UCUM`;
      return fields.join("|");
    })
    .join("\r");

  for (const [label, text, expectCode] of [
    ["undeclared", wire, false],
    ["declared UCUM", declared, true],
  ]) {
    const { bundle, issues } = convertToFhir(text);
    const quantities = resourcesOf(JSON.parse(serializeResource(bundle)), "Observation").map((obs) => obs.valueQuantity);
    assert.ok(quantities.length > 0 && quantities.every(Boolean), `${label}: every synthetic OBX is numeric`);
    for (const quantity of quantities) {
      // The unit is carried verbatim either way, and @cosyte/terminology reads it as valid UCUM.
      assert.equal(validateUcum(quantity.unit).valid, true, `${label}: a unit is not UCUM`);
      if (expectCode) {
        assert.equal(quantity.system, "http://unitsofmeasure.org");
        assert.equal(quantity.code, quantity.unit);
        assert.equal(validateUcum(quantity.code).valid, true);
      } else {
        // An undeclared unit is not promoted to a UCUM code: the transform flags it instead.
        assert.equal(quantity.code, undefined);
        assert.ok(issues.some((issue) => issue.code === "TRANSFORM_UNIT_NOT_UCUM"));
      }
    }
  }
});

test("the coding systems the transform writes are ones @cosyte/terminology resolves, but for a stated few", () => {
  /** @type {Set<string>} */
  const unresolved = new Set();
  for (const generate of Object.values(MESSAGE_KINDS)) {
    const { bundle } = convertToFhir(generate(SEEDS[0]));
    for (const { system } of codedValues(JSON.parse(serializeResource(bundle)))) {
      if (isUnknownSystem(resolveSystem(system))) unresolved.add(system);
    }
  }
  for (const system of unresolved) {
    assert.ok(KNOWN_UNRESOLVED_SYSTEMS.includes(system), `${system} does not resolve in @cosyte/terminology`);
  }
});

test("the de-identified Bundle parses back and keeps the clinical codes byte for byte", () => {
  for (const kind of ["ORU^R01", "VXU^V04", "ORM^O01"]) {
    const wire = MESSAGE_KINDS[kind](SEEDS[0]);
    const { message, bundle } = convertToFhir(wire);
    const { document, manifest } = deidentifyFhir(bundle);
    const text = serializeResource(document);
    assert.equal(resourceType(parseResource(text).resource), "Bundle", `${kind}: the de-identified Bundle does not read back`);
    assert.deepEqual(blockedLoci(manifest), EXPECTED_BLOCKED_LOCI, `${kind}: de-identification blocked an unexpected locus`);

    const before = JSON.parse(serializeResource(bundle));
    const after = JSON.parse(text);
    for (const type of ["Observation", "Immunization", "ServiceRequest"]) {
      assert.deepEqual(
        resourcesOf(after, type).map((resource) => codedValues(resource.code ?? resource.vaccineCode)),
        resourcesOf(before, type).map((resource) => codedValues(resource.code ?? resource.vaccineCode)),
        `${kind}: ${type} codes changed`,
      );
    }
    assertAbsent(text, patientValues(message), `${kind}: the de-identified Bundle`);
  }
});
