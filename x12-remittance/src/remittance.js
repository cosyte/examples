// @ts-check
import { generate835 } from "@cosyte/synth/x12";
import { get835, parseX12, serializeX12, X12Decimal } from "@cosyte/x12";

/**
 * Who carries an adjustment, by its CAS-01 group code. These are the four values of ASC X12 data
 * element 1033, named as @cosyte/x12 names them in its `CLAIM_ADJUSTMENT_GROUP_CODES` documentation;
 * the package exports the codes but no labels.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const GROUP_CODES = Object.freeze({
  CO: "Contractual Obligation",
  PR: "Patient Responsibility",
  OA: "Other Adjustment",
  PI: "Payer Initiated Reductions",
});

/**
 * The name of a group code, or undefined. `Object.hasOwn` keeps a code such as "constructor" from
 * resolving through the object prototype.
 *
 * @param {string} code
 * @returns {string | undefined}
 */
export function groupName(code) {
  return Object.hasOwn(GROUP_CODES, code) ? GROUP_CODES[code] : undefined;
}

/**
 * Build a synthetic 835 remittance. The same seed gives the same bytes on every machine, and every
 * name, identifier and amount comes from @cosyte/synth's synthetic pools.
 *
 * @param {number} seed
 * @returns {string} the X12 wire text, segments ended by the terminator declared in the ISA
 */
export function syntheticRemittance(seed) {
  return serializeX12(generate835({ seed }));
}

/**
 * Parse an interchange and read its 835 through the typed reader.
 *
 * @param {string} wire
 */
export function readRemittance(wire) {
  const interchange = parseX12(wire);
  const transaction = interchange.groups
    .flatMap((group) => group.transactions)
    .find((tx) => tx.st.elements[1] === "835");
  if (transaction === undefined) throw new Error("the interchange carries no 835 transaction set");
  const remittance = get835(interchange.delimiters, transaction);
  if (remittance === undefined) throw new Error("get835 did not read the transaction set");
  return { interchange, remittance };
}

/**
 * One CAS adjustment: the group says who carries it, the reason (a CARC) says why. The reason
 * description comes from the CARC snapshot @cosyte/x12 bundles.
 *
 * @param {import("@cosyte/x12").X12RemitAdjustment} adjustment
 */
export function describeAdjustment(adjustment) {
  return {
    group: adjustment.groupCode,
    groupName: groupName(adjustment.groupCode),
    reason: adjustment.reasonCode,
    reasonDescription: adjustment.reasonDescription,
    amount: adjustment.amount?.toString(),
  };
}

/**
 * One claim (CLP loop) with its service lines. Amounts stay exactly as sent (`X12Decimal.toString()`).
 *
 * @param {import("@cosyte/x12").X12RemitClaim} claim
 */
export function describeClaim(claim) {
  return {
    patientControlNumber: claim.patientControlNumber,
    payerClaimControlNumber: claim.payerClaimControlNumber,
    status: claim.claimStatusCode,
    statusDescription: claim.claimStatusDescription,
    charged: claim.totalChargeAmount?.toString(),
    paid: claim.totalPaymentAmount?.toString(),
    patientResponsibility: claim.patientResponsibilityAmount?.toString(),
    adjustments: claim.adjustments.map(describeAdjustment),
    lines: claim.serviceLines.map((line) => ({
      procedure: [line.productServiceIdQualifier, line.productServiceId, ...line.modifiers].join(":"),
      charged: line.chargeAmount?.toString(),
      paid: line.paymentAmount?.toString(),
      adjustments: line.adjustments.map(describeAdjustment),
    })),
  };
}

/**
 * Add amounts exactly. The result is undefined when any term was not decoded: an amount the sender
 * left out is not a zero, so there is no sum to report.
 *
 * @param {ReadonlyArray<X12Decimal | undefined>} amounts
 * @returns {X12Decimal | undefined}
 */
export function sum(amounts) {
  let total = X12Decimal.fromBigInt(0n, 2);
  for (const amount of amounts) {
    if (amount === undefined) return undefined;
    total = total.add(amount);
  }
  return total;
}

/**
 * @param {X12Decimal | undefined} stated
 * @param {X12Decimal | undefined} computed
 */
function verdict(stated, computed) {
  if (stated === undefined || computed === undefined) return "not evaluable";
  return stated.equals(computed) ? "balanced" : "out of balance";
}

/** @param {X12Decimal | undefined} amount */
const shown = (amount) => amount?.toString() ?? "(not decoded)";

/**
 * The three balance equations of an 835, recomputed from the parsed amounts with exact decimal
 * arithmetic. They are the equations @cosyte/x12's `BALANCE_INVARIANTS` names, which `get835` also
 * runs, reporting any failure on its warnings:
 *
 * - service line: SVC-02 charge = SVC-03 payment + the line's CAS adjustments
 * - claim: CLP-03 charge = CLP-04 payment + every CAS adjustment on the claim and its lines
 * - payment: BPR-02 = the sum of CLP-04 - the sum of PLB provider-level adjustments
 *
 * @param {import("@cosyte/x12").X12Remittance} remittance
 */
export function balanceChecks(remittance) {
  /**
   * @param {X12Decimal | undefined} charged
   * @param {X12Decimal | undefined} paid
   * @param {X12Decimal | undefined} adjusted
   */
  const chargeEquation = (charged, paid, adjusted) => ({
    equation: `${shown(charged)} charged = ${shown(paid)} paid + ${shown(adjusted)} adjusted`,
    result: verdict(charged, adjusted && paid?.add(adjusted)),
  });

  const checks = [];
  for (const claim of remittance.claims) {
    claim.serviceLines.forEach((line, index) => {
      const adjusted = sum(line.adjustments.map((adjustment) => adjustment.amount));
      checks.push({
        name: `claim ${claim.patientControlNumber} line ${index + 1}`,
        ...chargeEquation(line.chargeAmount, line.paymentAmount, adjusted),
      });
    });
    const everyAdjustment = [...claim.adjustments, ...claim.serviceLines.flatMap((line) => line.adjustments)];
    const adjusted = sum(everyAdjustment.map((adjustment) => adjustment.amount));
    checks.push({
      name: `claim ${claim.patientControlNumber}`,
      ...chargeEquation(claim.totalChargeAmount, claim.totalPaymentAmount, adjusted),
    });
  }

  const payment = remittance.payment.totalActualPayment;
  const onClaims = sum(remittance.claims.map((claim) => claim.totalPaymentAmount));
  const provider = sum(remittance.providerAdjustments.map((adjustment) => adjustment.amount));
  checks.push({
    name: "payment",
    equation:
      `${shown(payment)} paid = ${shown(onClaims)} paid on claims` +
      ` - ${shown(provider)} provider adjustments`,
    result: verdict(payment, provider && onClaims?.subtract(provider)),
  });
  return checks;
}
