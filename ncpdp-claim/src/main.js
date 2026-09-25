// @ts-check
import { adjudication, claim, fieldValue, findSegment, parseTelecom } from "@cosyte/ncpdp/telecom";
import { submittedPricing, syntheticClaim, syntheticResponse, visibleWire } from "./claim.js";

const SEED = 1;

/** @param {string} label @param {string | undefined} value */
const row = (label, value) => console.log(`  ${label.padEnd(28)}${value ?? "absent"}`);

/**
 * An amount beside its wire form, e.g. "456G   45.67".
 *
 * @param {import("@cosyte/ncpdp/telecom").TelecomMoney | undefined} money
 */
const amount = (money) => {
  if (money === undefined) return "absent";
  return `${money.source.padEnd(5)}${money.isValid ? money.amount?.padStart(7) : "  not a valid amount"}`;
};

// The claim: a synthetic B1 from @cosyte/synth, plus the Pricing segment src/claim.js adds.
const request = parseTelecom(syntheticClaim(SEED));
const b1 = claim(request);
const { header } = request;
const quantity = b1?.quantityDispensed;

console.log(`Claim: synthetic B1 from @cosyte/synth (seed ${SEED}), Pricing segment added`);
row("Segments", request.segments.map((s) => `${s.segmentId} ${s.name ?? "?"}`).join(", "));
row("BIN / PCN / group", `${header.binNumber} / ${header.processorControlNumber} / ${b1?.groupId}`);
row("Transaction", `${header.transactionCode}, version ${header.versionRelease}`);
row("Date of service", header.dateOfService);
row("Pharmacy", `${header.serviceProviderId} (ID qualifier ${header.serviceProviderIdQualifier})`);
row("Prescription", `${b1?.prescriptionReferenceNumber}, fill ${b1?.fillNumber}`);
row("Product/service ID", `${b1?.product?.id} (qualifier ${b1?.product?.qualifier})`);
// Quantity Dispensed carries three implied decimal places; the library applies them string-wise.
row("Quantity dispensed", `${quantity?.source} on the wire, ${quantity?.impliedDecimal} decoded`);
row("Days supply", b1?.daysSupply?.source);
row("Pricing submitted", "wire  amount");
for (const { id, label, money } of submittedPricing(request)) row(`  ${label} (${id})`, amount(money));
row("Parse warnings", String(request.warnings.length));

// The response: synth generates requests only, so src/claim.js writes a paid answer to this claim.
const responseWire = syntheticResponse(request);
const response = parseTelecom(responseWire);
const outcome = adjudication(response);
const status = outcome?.status;
const paid = outcome?.pricing;
// The library has no view over the Response Claim segment (22), so read its field by ID.
const echoedRx = fieldValue(findSegment(response.segments, "22"), "D2");
const pharmacy = response.responseHeader?.serviceProviderId;
const rejects = status?.rejectCodes.map((reject) => reject.code) ?? [];

console.log("\nResponse: synthetic paid answer written by src/claim.js");
for (const line of visibleWire(responseWire)) console.log(`  ${line}`);
row("Echoes", `${outcome?.transactionCode}, pharmacy ${pharmacy}, prescription ${echoedRx}`);
row("Transmission status", response.responseHeader?.headerResponseStatus);
row("Claim status", `${status?.transactionResponseStatus}, disposition ${status?.disposition}`);
row("Authorization", status?.authorizationNumber);
row("Reject codes", rejects.join(", ") || "none");
row("Pricing paid", "wire  amount");
row("  Ingredient cost (F6)", amount(paid?.ingredientCostPaid));
row("  Dispensing fee (F7)", amount(paid?.dispensingFeePaid));
row("  Total amount paid (F9)", amount(paid?.totalAmountPaid));
row("  Patient pay (F5)", amount(paid?.patientPayAmount));
row("Parse warnings", String(response.warnings.length));
