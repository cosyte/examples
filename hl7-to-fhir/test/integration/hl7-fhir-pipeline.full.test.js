// @ts-check
// Integration, full suite: the fast slice's pipeline over a seed sweep of every message kind.
import assert from "node:assert/strict";
import { test } from "node:test";
import { serializeResource } from "@cosyte/fhir";
import { isUnknownSystem, resolveSystem } from "@cosyte/terminology";
import { convertToFhir } from "../../src/convert.js";
import { KNOWN_UNRESOLVED_SYSTEMS, MESSAGE_KINDS, checkMessage, codedValues, seedRange } from "./support.js";

const SEEDS = seedRange(1, 250);

for (const [kind, generate] of Object.entries(MESSAGE_KINDS)) {
  test(`${kind}, ${SEEDS.length} seeds: converts, validates, and de-identifies with no identifier left`, () => {
    for (const seed of SEEDS) checkMessage(generate(seed), `${kind} seed ${seed}`);
  });

  test(`${kind}, ${SEEDS.length} seeds: every coding system resolves in @cosyte/terminology, but for a stated few`, () => {
    for (const seed of SEEDS) {
      const { bundle } = convertToFhir(generate(seed));
      for (const { system } of codedValues(JSON.parse(serializeResource(bundle)))) {
        if (isUnknownSystem(resolveSystem(system))) {
          assert.ok(KNOWN_UNRESOLVED_SYSTEMS.includes(system), `${kind} seed ${seed}: ${system} does not resolve`);
        }
      }
    }
  });
}
