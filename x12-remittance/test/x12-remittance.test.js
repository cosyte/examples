// @ts-check
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { lookupCarc, lookupClpStatus, X12Decimal } from "@cosyte/x12";
import { balanceChecks, describeClaim, readRemittance, syntheticRemittance } from "../src/remittance.js";

const run = promisify(execFile);
const starterDir = fileURLToPath(new URL("..", import.meta.url));
const SEED = 42;

/** @param {string} text */
const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** @param {string} text */
const decimal = (text) => X12Decimal.fromString(text) ?? assert.fail(`not a decimal: ${text}`);

/**
 * Split the wire text by hand, without the library, to have a second route to every value.
 *
 * @param {string} wire
 * @param {import("@cosyte/x12").Delimiters} delimiters
 */
function rawSegments(wire, delimiters) {
  return wire
    .split(delimiters.segment)
    .filter(Boolean)
    .map((text) => text.split(delimiters.element));
}

/**
 * @param {string[][]} segments
 * @param {import("@cosyte/x12").Delimiters} delimiters
 */
function joinSegments(segments, delimiters) {
  return segments.map((elements) => elements.join(delimiters.element) + delimiters.segment).join("");
}

/** @param {string[][]} segments @param {string} id */
const segmentOf = (segments, id) =>
  segments.find((elements) => elements[0] === id) ?? assert.fail(`no ${id} segment`);

test("npm start prints the payment, each claim with its adjustments, and a balanced remit", async () => {
  const { stdout } = await run(process.execPath, ["src/main.js"], { cwd: starterDir });
  const { remittance } = readRemittance(syntheticRemittance(SEED));
  /** @param {string} pattern */
  const printed = (pattern) => assert.match(stdout, new RegExp(pattern, "m"));

  printed(`^  amount\\s+${literal(remittance.payment.totalActualPayment?.toString() ?? "?")} \\(`);
  printed(`^  method\\s+${literal(remittance.payment.method)}$`);
  printed(`^  trace\\s+${literal(remittance.traces[0]?.referenceId ?? "?")}`);
  for (const claim of remittance.claims.map(describeClaim)) {
    printed(`^Claim ${literal(claim.patientControlNumber)} `);
    printed(`^  status\\s+${literal(`${claim.status} ${claim.statusDescription}`)}$`);
    printed(`^  charged\\s+${literal(claim.charged ?? "?")}$`);
    printed(`^  paid\\s+${literal(claim.paid ?? "?")}$`);
    printed(`^  patient responsibility\\s+${literal(claim.patientResponsibility ?? "?")}$`);
    for (const adjustment of claim.lines.flatMap((line) => line.adjustments)) {
      const { group, reason, amount, groupName, reasonDescription } = adjustment;
      const text = `${group} ${reason} ${amount}: ${groupName}, ${reasonDescription}`;
      printed(`^    adjustment\\s+${literal(text)}$`);
    }
  }
  for (const check of balanceChecks(remittance)) printed(`^  balanced\\s+${literal(check.name)}: `);
  printed("^Warnings \\(parse and 835 reader\\): 0$");
});

test("the typed reading agrees with the raw BPR, TRN, CLP and CAS segments", () => {
  const wire = syntheticRemittance(SEED);
  const { interchange, remittance } = readRemittance(wire);
  const segments = rawSegments(wire, interchange.delimiters);

  assert.equal(interchange.warnings.length, 0);
  assert.equal(remittance.warnings.length, 0);

  const bpr = segmentOf(segments, "BPR");
  assert.equal(remittance.payment.totalActualPayment?.toString(), bpr[2]);
  assert.equal(remittance.payment.creditDebitFlag, bpr[3]);
  assert.equal(remittance.payment.method, bpr[4]);
  assert.equal(remittance.traces[0]?.referenceId, segmentOf(segments, "TRN")[2]);

  const clps = segments.filter((elements) => elements[0] === "CLP");
  assert.equal(remittance.claims.length, clps.length);
  remittance.claims.forEach((claim, index) => {
    const clp = clps[index] ?? [];
    assert.equal(claim.patientControlNumber, clp[1]);
    assert.equal(claim.claimStatusCode, clp[2]);
    assert.equal(claim.claimStatusDescription, lookupClpStatus(clp[2] ?? "")?.description);
    assert.equal(claim.totalChargeAmount?.toString(), clp[3]);
    assert.equal(claim.totalPaymentAmount?.toString(), clp[4]);
    assert.equal(claim.patientResponsibilityAmount?.toString(), clp[5]);
  });

  // One CAS segment carries up to six reason and amount triples under one group code.
  const rawAdjustments = segments
    .filter((elements) => elements[0] === "CAS")
    .flatMap(([, group, ...triples]) => {
      const rows = [];
      for (let i = 0; i < triples.length; i += 3) rows.push([group, triples[i], triples[i + 1]].join(" "));
      return rows;
    });
  const readAdjustments = remittance.claims
    .flatMap((claim) => [...claim.adjustments, ...claim.serviceLines.flatMap((line) => line.adjustments)])
    .map((adjustment) => {
      assert.equal(adjustment.reasonDescription, lookupCarc(adjustment.reasonCode)?.description);
      return [adjustment.groupCode, adjustment.reasonCode, adjustment.amount?.toString()].join(" ");
    });
  assert.deepEqual(readAdjustments.sort(), rawAdjustments.sort());

  assert.deepEqual(
    balanceChecks(remittance).map((check) => check.result),
    balanceChecks(remittance).map(() => "balanced"),
  );
});

test("an 835 whose payment does not add up is reported, not rebalanced", () => {
  const wire = syntheticRemittance(SEED);
  const { interchange } = readRemittance(wire);
  const segments = rawSegments(wire, interchange.delimiters);
  const bpr = segmentOf(segments, "BPR");
  bpr[2] = decimal(bpr[2] ?? "").add(decimal("1.00")).toString();

  const { remittance } = readRemittance(joinSegments(segments, interchange.delimiters));
  assert.equal(balanceChecks(remittance).find((check) => check.name === "payment")?.result, "out of balance");
  assert.ok(remittance.warnings.some((warning) => warning.code === "X12_835_REMIT_BALANCE_MISMATCH"));
});

test("a provider-level adjustment (PLB) is subtracted from the claim payments, as get835 does", () => {
  const wire = syntheticRemittance(SEED);
  const { interchange, remittance: original } = readRemittance(wire);
  const segments = rawSegments(wire, interchange.delimiters);

  // Take 10.00 back at provider level: add a PLB before SE, lower BPR-02 to match, restate SE-01.
  const bpr = segmentOf(segments, "BPR");
  bpr[2] = decimal(bpr[2] ?? "").subtract(decimal("10.00")).toString();
  const se = segmentOf(segments, "SE");
  const plb = ["PLB", original.payee?.idCode ?? "", original.payment.paymentDate, "WO", "10.00"];
  segments.splice(segments.indexOf(se), 0, plb);
  se[1] = String(Number(se[1]) + 1);

  const { interchange: changed, remittance } = readRemittance(joinSegments(segments, interchange.delimiters));
  assert.equal(changed.warnings.length, 0);
  assert.equal(remittance.providerAdjustments.length, 1);
  assert.equal(remittance.warnings.length, 0);
  assert.equal(balanceChecks(remittance).find((check) => check.name === "payment")?.result, "balanced");
});
