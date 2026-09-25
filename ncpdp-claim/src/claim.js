// @ts-check
import {
  FIELD_SEPARATOR,
  GROUP_SEPARATOR,
  SEGMENT_SEPARATOR,
  buildTelecomRequest,
  claim,
  fieldValue,
  findSegment,
  parseTelecom,
  serializeTelecom,
  telecomMoney,
} from "@cosyte/ncpdp/telecom";
import { generateB1 } from "@cosyte/synth/ncpdp";

/**
 * The Pricing segment (11) this example adds to the claim, with synthetic amounts. An NCPDP amount has
 * two implied decimal places and signs its last character (the overpunch): "456G" is 45.67.
 */
export const PRICING_FIELDS = Object.freeze([
  { id: "D9", label: "Ingredient cost", value: "456G" },
  { id: "DC", label: "Dispensing fee", value: "25{" },
  { id: "DQ", label: "Usual and customary", value: "550{" },
  { id: "DU", label: "Gross amount due", value: "481G" },
]);

/**
 * Response Pricing (23) when the synthetic payer pays: patient pay 10.00 (F5), ingredient cost 40.50
 * (F6), dispensing fee 1.75 (F7), total paid 32.25 (F9), which is 40.50 + 1.75 - 10.00.
 */
const PAID_PRICING = ["F5100{", "F6405{", "F717E", "F9322E"];

/**
 * Build a synthetic B1 billing claim. @cosyte/synth builds it through @cosyte/ncpdp's own request
 * builder, with every identifier drawn from synthetic ranges. Its B1 carries no Pricing segment, so we
 * add one through the same builder, which keeps the claim spec-clean.
 *
 * @param {number} seed
 * @returns {string} the Telecom D.0 wire text
 */
export function syntheticClaim(seed) {
  const wire = generateB1({ seed });
  const b1 = parseTelecom(wire);
  if (findSegment(b1.segments, "11") !== undefined) return wire;

  const segments = b1.segments.map((segment) => ({
    segmentId: segment.segmentId,
    fields: segment.fields.map(({ id, value }) => ({ id, value })),
  }));
  segments.push({ segmentId: "11", fields: PRICING_FIELDS.map(({ id, value }) => ({ id, value })) });
  return serializeTelecom(buildTelecomRequest({ header: b1.header, segments }));
}

/**
 * The submitted amounts in a parsed claim's Pricing segment, each decoded string-wise, never as a float.
 * The library has no view over this segment, so we read its fields by ID.
 *
 * @param {import("@cosyte/ncpdp/telecom").TelecomTransaction} transaction
 */
export function submittedPricing(transaction) {
  const pricing = findSegment(transaction.segments, "11");
  return PRICING_FIELDS.map(({ id, label }) => {
    const source = fieldValue(pricing, id);
    return { id, label, money: source === undefined ? undefined : telecomMoney(source) };
  });
}

/**
 * Write a synthetic payer response to a parsed claim. @cosyte/synth generates requests only and
 * @cosyte/ncpdp builds requests only, so this is hand-written wire text. It echoes the claim's
 * transaction code, pharmacy, date of service and prescription number. With no reject codes it answers
 * paid, with the synthetic amounts above; with reject codes it answers rejected and carries no pricing.
 *
 * @param {import("@cosyte/ncpdp/telecom").TelecomTransaction} request
 * @param {string[]} [rejectCodes]
 * @returns {string} the Telecom D.0 response wire text
 */
export function syntheticResponse(request, rejectCodes = []) {
  const { header } = request;
  const rx = claim(request);
  const paid = rejectCodes.length === 0;

  // The fixed-width response header: version, transaction code, transaction count, header status
  // (A: the transmission was accepted), pharmacy ID qualifier, pharmacy ID (15 wide), date of service.
  const head =
    `D0${header.transactionCode}1A${header.serviceProviderIdQualifier.padEnd(2)}` +
    `${header.serviceProviderId.padEnd(15)}${header.dateOfService}`;

  const status = paid
    ? ["ANP", "F3SYNTHAUTH01"]
    : ["ANR", `FA${rejectCodes.length}`, ...rejectCodes.map((code) => `FB${code}`)];
  const echo = [`EM${rx?.prescriptionReferenceQualifier ?? ""}`, `D2${rx?.prescriptionReferenceNumber ?? ""}`];
  /** @type {[string, string[]][]} */
  const segments = [
    ["21", status], // Response Status
    ["22", echo], // Response Claim
  ];
  if (paid) segments.push(["23", PAID_PRICING]); // Response Pricing

  // A group separator opens the transaction; a segment separator opens each segment, and a field
  // separator each field, the AM segment ID first.
  const body = segments
    .map(([id, fields]) => [`AM${id}`, ...fields].map((field) => FIELD_SEPARATOR + field).join(""))
    .map((segment) => SEGMENT_SEPARATOR + segment);
  return head + GROUP_SEPARATOR + body.join("");
}

/**
 * Show Telecom wire text with its control characters named, a line per group and segment.
 *
 * @param {string} wire
 * @returns {string[]}
 */
export function visibleWire(wire) {
  return wire
    .replaceAll(GROUP_SEPARATOR, "\n<GS>")
    .replaceAll(SEGMENT_SEPARATOR, "\n<RS>")
    .replaceAll(FIELD_SEPARATOR, "<FS>")
    .split("\n");
}
