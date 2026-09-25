// @ts-check
import { generate271 } from "@cosyte/synth/x12";
import { get271Eligibility, parseX12, serializeX12 } from "@cosyte/x12";

/**
 * Labels for the EB-01 benefit types this starter names. They are values of ASC X12 data element
 * 1390 (Eligibility or Benefit Information Code), which EB-01 of the 005010X279A1 271 carries.
 * @cosyte/x12 0.0.18 bundles no table for EB-01 (its `X12EligibilityBenefit` documentation names
 * 1, 6 and I), so we keep this short list and print any other code as sent.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const BENEFIT_TYPES = Object.freeze({
  1: "Active Coverage",
  6: "Inactive",
  A: "Co-Insurance",
  B: "Co-Payment",
  C: "Deductible",
  G: "Out of Pocket (Stop Loss)",
  I: "Non-Covered",
});

/** The EB-01 codes that state what the member pays: co-insurance, co-payment, deductible, out of pocket. */
export const COST_SHARING_CODES = Object.freeze(["A", "B", "C", "G"]);

/** The EB-01 codes that state whether coverage is in force: 1 to 5 active, 6 to 8 inactive. */
export const COVERAGE_STATUS_CODES = Object.freeze(["1", "2", "3", "4", "5", "6", "7", "8"]);

/**
 * DTP-01 qualifiers named in @cosyte/x12's `X12EligibilityDate` documentation.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const DATE_QUALIFIERS = Object.freeze({ 307: "eligibility", 291: "plan" });

/**
 * A label from one of the tables above, or undefined. `Object.hasOwn` keeps a code such as
 * "constructor" from resolving through the object prototype.
 *
 * @param {Readonly<Record<string, string>>} table
 * @param {string} code
 * @returns {string | undefined}
 */
export function label(table, code) {
  return Object.hasOwn(table, code) ? table[code] : undefined;
}

/**
 * A DTP or DMG date for display: `D8` (`CCYYMMDD`) as `YYYY-MM-DD`, `RD8` as a range, and any other
 * format as sent. @cosyte/x12 0.1.0 adds `toISO` for the same job.
 *
 * @param {{ formatQualifier: string, value: string }} date
 * @returns {string}
 */
export function formatDate({ formatQualifier, value }) {
  const day = (/** @type {string} */ text) =>
    /^\d{8}$/.test(text) ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6)}` : text;
  if (formatQualifier === "D8") return day(value);
  if (formatQualifier === "RD8") return value.split("-").map(day).join(" to ");
  return `${value} (${formatQualifier})`;
}

/**
 * Build a synthetic 271 eligibility response. The same seed gives the same bytes on every machine,
 * and every name, member ID, date and address comes from @cosyte/synth's synthetic pools.
 *
 * @param {number} seed
 * @returns {string} the X12 wire text, segments ended by the terminator declared in the ISA
 */
export function syntheticEligibilityResponse(seed) {
  return serializeX12(generate271({ seed }));
}

/**
 * Parse an interchange and read its 271 through the typed reader.
 *
 * @param {string} wire
 */
export function readEligibility(wire) {
  const interchange = parseX12(wire);
  const transaction = interchange.groups
    .flatMap((group) => group.transactions)
    .find((tx) => tx.st.elements[1] === "271");
  if (transaction === undefined) throw new Error("the interchange carries no 271 transaction set");
  const eligibility = get271Eligibility(interchange.delimiters, transaction);
  if (eligibility === undefined) throw new Error("get271Eligibility did not read the transaction set");

  // @cosyte/x12 0.0.18 does not put AAA request-validation segments (the payer saying it could not
  // process the inquiry, and why) on the typed model. They stay on the transaction set, so we count
  // them there: without this check, a rejected inquiry reads like a member with no benefits.
  const rejections = transaction.segments.filter((segment) => segment.id === "AAA").length;

  return { interchange, eligibility, rejections };
}

/**
 * One EB benefit line, with amounts kept exactly as sent (`X12Decimal.toString()`, never a float).
 *
 * @param {import("@cosyte/x12").X12EligibilityBenefit} benefit
 */
export function describeBenefit(benefit) {
  return {
    code: benefit.eligibilityCode,
    type: label(BENEFIT_TYPES, benefit.eligibilityCode),
    coverageLevel: benefit.coverageLevelCode,
    serviceTypes: benefit.serviceTypeCodes.map(({ code, description }) => ({ code, description })),
    insuranceType: benefit.insuranceTypeCode,
    planDescription: benefit.planCoverageDescription,
    timePeriod: benefit.timePeriodQualifier,
    amount: benefit.monetaryAmount?.toString(),
    percent: benefit.percent?.toString(),
    quantity: benefit.quantity?.toString(),
    inNetwork: benefit.inPlanNetwork,
  };
}

/**
 * The facts a front desk asks of a 271 about one subscriber: who answered, who is covered, the group
 * and plan, the trace to match against the inquiry, and every benefit line.
 *
 * @param {import("@cosyte/x12").X12EligibilitySubscriber} subscriber
 */
export function describeSubscriber(subscriber) {
  const { name } = subscriber;
  // REF-01 6P is the group number and 18 the plan number; REF-03, when sent, carries the name.
  const group = subscriber.references.find((ref) => ref.qualifier === "6P");
  const plan = subscriber.references.find((ref) => ref.qualifier === "18");
  const benefits = subscriber.benefits.map(describeBenefit);
  const planDescriptions = benefits.flatMap((benefit) => benefit.planDescription ?? []);

  return {
    payer: subscriber.informationSource,
    provider: subscriber.informationReceiver,
    name: [name?.lastName, name?.firstName].filter(Boolean).join(", "),
    memberId: name?.idCode,
    memberIdQualifier: name?.idQualifier,
    dateOfBirth: name?.dateOfBirth,
    sex: name?.genderCode,
    traces: subscriber.traces.map((trace) => trace.referenceId),
    group: { number: group?.value, name: group?.description },
    plan: { number: plan?.value, name: plan?.description ?? planDescriptions[0] },
    dates: subscriber.dates,
    benefits,
    coverageStatus: benefits.filter((benefit) => COVERAGE_STATUS_CODES.includes(benefit.code)),
    costSharing: benefits.filter((benefit) => COST_SHARING_CODES.includes(benefit.code)),
  };
}
