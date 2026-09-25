// @ts-check
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { build271, lookupServiceType, serializeX12, X12Decimal } from "@cosyte/x12";
import { describeSubscriber, readEligibility, syntheticEligibilityResponse } from "../src/eligibility.js";

const run = promisify(execFile);
const starterDir = fileURLToPath(new URL("..", import.meta.url));
const SEED = 42;

/** @param {string} text */
const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The first subscriber's facts, read from a wire text. */
function firstSubscriber(/** @type {string} */ wire) {
  const { eligibility } = readEligibility(wire);
  const subscriber = eligibility.subscribers[0];
  assert.ok(subscriber, "expected a subscriber in the 271");
  return describeSubscriber(subscriber);
}

test("npm start prints the payer, subscriber and benefits read from the synthetic 271", async () => {
  const { stdout } = await run(process.execPath, ["src/main.js"], { cwd: starterDir });
  const facts = firstSubscriber(syntheticEligibilityResponse(SEED));
  /** @param {string} pattern */
  const printed = (pattern) => assert.match(stdout, new RegExp(pattern, "m"));

  printed(`^Payer \\(information source\\): ${literal(facts.payer?.name ?? "?")}, `);
  printed(`^  member ID\\s+${literal(facts.memberId ?? "?")} \\(MI\\)$`);
  printed(`^  group number\\s+${literal(facts.group.number ?? "?")} \\(REF 6P\\)$`);
  printed(`^  270 trace\\s+${literal(facts.traces.join(", "))} `);
  for (const benefit of facts.benefits) {
    printed(`^  ${literal(`${benefit.code} ${benefit.type}`)}, coverage level `);
    printed(`^    amount\\s+${literal(benefit.amount ?? "?")}$`);
  }
  const status = facts.coverageStatus.map((benefit) => `${benefit.code} ${benefit.type}`).join("; ");
  printed(`^Coverage status: ${literal(status)}$`);
  printed("^Inquiry rejections \\(AAA segments\\): 0$");
  printed("^Warnings \\(parse and 271 reader\\): 0$");
});

test("the typed reading agrees with the raw segments of the synthetic 271", () => {
  const wire = syntheticEligibilityResponse(SEED);
  const { interchange, eligibility, rejections } = readEligibility(wire);
  const { element, repetition, segment } = interchange.delimiters;
  // Split the wire text by hand, without the library, to have a second route to every value.
  const segments = wire.split(segment).filter(Boolean).map((text) => text.split(element));
  /** @param {string} id @param {string} qualifier */
  const find = (id, qualifier) => segments.find((s) => s[0] === id && s[1] === qualifier) ?? [];

  assert.equal(interchange.warnings.length, 0);
  assert.equal(eligibility.warnings.length, 0);
  assert.equal(rejections, 0);
  assert.equal(eligibility.subscribers.length, 1);

  const facts = firstSubscriber(wire);
  assert.equal(facts.payer?.name, find("NM1", "PR")[3]);
  assert.equal(facts.payer?.idCode, find("NM1", "PR")[9]);
  assert.equal(facts.provider?.name, find("NM1", "1P")[3]);
  assert.equal(facts.name, `${find("NM1", "IL")[3]}, ${find("NM1", "IL")[4]}`);
  assert.equal(facts.memberId, find("NM1", "IL")[9]);
  assert.equal(facts.group.number, find("REF", "6P")[2]);
  assert.deepEqual(facts.traces, segments.filter((s) => s[0] === "TRN").map((s) => s[2]));

  const ebs = segments.filter((s) => s[0] === "EB");
  assert.equal(facts.benefits.length, ebs.length);
  facts.benefits.forEach((benefit, index) => {
    const eb = ebs[index] ?? [];
    assert.equal(benefit.code, eb[1]);
    assert.equal(benefit.coverageLevel, eb[2] || undefined);
    assert.deepEqual(
      benefit.serviceTypes.map((service) => service.code),
      (eb[3] ?? "").split(repetition),
    );
    for (const service of benefit.serviceTypes) {
      assert.equal(service.description, lookupServiceType(service.code)?.description);
    }
    assert.equal(benefit.amount, eb[7] || undefined);
    assert.equal(benefit.percent, eb[8] || undefined);
    assert.equal(benefit.inNetwork, eb[12] || undefined);
  });
});

test("co-payment, deductible and co-insurance lines are labelled and keep their amounts exactly", () => {
  /** @param {string} text */
  const amount = (text) => X12Decimal.fromString(text) ?? assert.fail(`not a decimal: ${text}`);
  // @cosyte/synth 0.0.9 writes no cost-sharing lines, so this test builds a small 271 through
  // @cosyte/x12's own build271. Every value in it is fictional.
  const built = build271({
    envelope: {
      senderId: "ZZTESTPAYER",
      receiverId: "ZZTESTCLINIC",
      interchangeDate: "260101",
      interchangeTime: "1200",
      interchangeControlNumber: "000000001",
      groupControlNumber: "1",
      transactionSetControlNumber: "0001",
      usageIndicator: "T",
    },
    informationSources: [
      {
        entity: { entityIdentifierCode: "PR", entityTypeQualifier: "2", name: "EXAMPLE PAYER" },
        receivers: [
          {
            entity: { entityIdentifierCode: "1P", entityTypeQualifier: "2", name: "EXAMPLE CLINIC" },
            subscribers: [
              {
                name: { entityIdentifierCode: "IL", entityTypeQualifier: "1", lastName: "ZZTEST" },
                benefits: [
                  { eligibilityCode: "1", coverageLevelCode: "IND", serviceTypeCodes: [{ code: "30" }] },
                  { eligibilityCode: "B", serviceTypeCodes: [{ code: "98" }], monetaryAmount: amount("25") },
                  { eligibilityCode: "C", timePeriodQualifier: "23", monetaryAmount: amount("1500.00") },
                  { eligibilityCode: "A", serviceTypeCodes: [{ code: "98" }], percent: amount(".2") },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  const facts = firstSubscriber(serializeX12(built));

  assert.deepEqual(
    facts.costSharing.map((b) => [b.code, b.type, b.amount, b.percent, b.timePeriod]),
    [
      ["B", "Co-Payment", "25", undefined, undefined],
      ["C", "Deductible", "1500.00", undefined, "23"],
      ["A", "Co-Insurance", undefined, ".2", undefined],
    ],
  );
  assert.deepEqual(
    facts.coverageStatus.map((b) => [b.code, b.type]),
    [["1", "Active Coverage"]],
  );
});
