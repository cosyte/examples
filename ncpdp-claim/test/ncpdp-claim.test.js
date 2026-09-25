// @ts-check
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { FIELD_SEPARATOR, adjudication, claim, fieldValue, findSegment, parseTelecom } from "@cosyte/ncpdp/telecom";
import { PRICING_FIELDS, submittedPricing, syntheticClaim, syntheticResponse } from "../src/claim.js";

const run = promisify(execFile);
const starterDir = fileURLToPath(new URL("..", import.meta.url));

/** Integer cents from a decoded amount such as "32.25", so the check below never uses a float. */
const cents = (/** @type {string | undefined} */ amount) => BigInt((amount ?? "").replace(".", ""));

test("npm start prints the claim facts and a paid response that echoes the claim", async () => {
  const { stdout } = await run(process.execPath, ["src/main.js"], { cwd: starterDir });
  const b1 = claim(parseTelecom(syntheticClaim(1)));
  const product = `${b1?.product?.id} \\(qualifier ${b1?.product?.qualifier}\\)`;
  const echoes = `B1, pharmacy \\d+, prescription ${b1?.prescriptionReferenceNumber}`;

  assert.match(stdout, /^Claim: synthetic B1 from @cosyte\/synth \(seed 1\)/);
  assert.match(stdout, new RegExp(`^  Product/service ID\\s+${product}$`, "m"));
  assert.match(stdout, new RegExp(`^  Echoes\\s+${echoes}$`, "m"));
  assert.match(stdout, /^  Claim status\s+P, disposition paid$/m);
  assert.match(stdout, /^  Reject codes\s+none$/m);
  assert.equal(stdout.match(/^  Parse warnings\s+0$/gm)?.length, 2);
});

test("the claim view reads the fields the synthetic B1 carries, and the added Pricing segment", () => {
  const request = parseTelecom(syntheticClaim(1));
  const b1 = claim(request);
  const claimSegment = findSegment(request.segments, "07");

  assert.equal(request.kind, "request");
  assert.equal(request.warnings.length, 0);
  assert.equal(b1?.transactionCode, "B1");
  assert.equal(b1?.groupId, fieldValue(findSegment(request.segments, "04"), "C1"));
  assert.equal(b1?.product?.id, fieldValue(claimSegment, "D7"));
  assert.equal(b1?.daysSupply?.source, fieldValue(claimSegment, "D5"));

  // Quantity Dispensed keeps its wire digits and applies three implied decimals, string-wise.
  const digits = fieldValue(claimSegment, "E7") ?? "";
  const padded = digits.padStart(4, "0");
  assert.equal(b1?.quantityDispensed?.source, digits);
  assert.equal(b1?.quantityDispensed?.impliedDecimal, `${BigInt(padded.slice(0, -3))}.${padded.slice(-3)}`);

  assert.equal(request.segments.filter((segment) => segment.segmentId === "11").length, 1);
  const submitted = submittedPricing(request);
  assert.deepEqual(
    submitted.map(({ id }) => id),
    PRICING_FIELDS.map(({ id }) => id),
  );
  assert.ok(submitted.every(({ money }) => money?.isValid), "every submitted amount decodes");
  assert.equal(submitted.find(({ id }) => id === "D9")?.money?.amount, "45.67");
});

test("a paid response echoes the claim and its amounts add up", () => {
  const request = parseTelecom(syntheticClaim(1));
  const response = parseTelecom(syntheticResponse(request));
  const outcome = adjudication(response);
  const paid = outcome?.pricing;

  assert.equal(response.kind, "response");
  assert.equal(response.warnings.length, 0);
  assert.equal(outcome?.transactionCode, request.header.transactionCode);
  assert.equal(response.responseHeader?.serviceProviderId, request.header.serviceProviderId);
  const echoedRx = fieldValue(findSegment(response.segments, "22"), "D2");
  assert.equal(echoedRx, claim(request)?.prescriptionReferenceNumber);
  assert.equal(outcome?.status?.disposition, "paid");
  assert.deepEqual(outcome?.status?.rejectCodes, []);
  const [ingredient, fee, patientPay, total] = [
    paid?.ingredientCostPaid,
    paid?.dispensingFeePaid,
    paid?.patientPayAmount,
    paid?.totalAmountPaid,
  ].map((money) => cents(money?.amount));
  assert.equal(total, ingredient + fee - patientPay);
});

test("a rejected response reads as rejected, with every reject code in wire order", () => {
  const request = parseTelecom(syntheticClaim(1));
  const rejected = syntheticResponse(request, ["75", "88"]);
  const outcome = adjudication(parseTelecom(rejected));

  assert.equal(outcome?.status?.disposition, "rejected");
  assert.equal(outcome?.status?.transactionResponseStatus, "R");
  assert.deepEqual(
    outcome?.status?.rejectCodes.map((reject) => reject.code),
    ["75", "88"],
  );
  assert.equal(outcome?.pricing, undefined);

  // A reject always wins: a status of P that carries a reject code still reads as rejected.
  const statusSaysPaid = rejected.replace(`${FIELD_SEPARATOR}ANR`, `${FIELD_SEPARATOR}ANP`);
  const conflicting = adjudication(parseTelecom(statusSaysPaid));
  assert.equal(conflicting?.status?.transactionResponseStatus, "P");
  assert.equal(conflicting?.status?.disposition, "rejected");
  assert.equal(conflicting?.status?.statusConflict, true);
});
