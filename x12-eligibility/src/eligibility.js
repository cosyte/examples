// @ts-check
import { generate271 } from "@cosyte/synth/x12";
import { build270, get270Inquiry, get271Eligibility, parseX12, serializeX12, toISO } from "@cosyte/x12";

/**
 * Labels for the EB-01 benefit types this starter names. They are values of ASC X12 data element
 * 1390 (Eligibility or Benefit Information Code), which EB-01 of the 005010X279A1 271 carries.
 * @cosyte/x12 0.1.0 bundles no table for EB-01 (its `X12EligibilityBenefit` documentation names
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
 * A DTP or DMG date for display. `toISO` from @cosyte/x12 reads a `D8` (`CCYYMMDD`) day as
 * `YYYY-MM-DD`. It answers `undefined` for an `RD8` range, which is not a single day, so a range
 * prints as its two days. Anything else prints as sent, with its format qualifier.
 *
 * @param {{ formatQualifier: string, value: string }} date
 * @returns {string}
 */
export function formatDate({ formatQualifier, value }) {
  const day = (/** @type {string} */ text) => toISO({ formatQualifier: "D8", value: text }) ?? text;
  if (formatQualifier === "RD8") return value.split("-").map(day).join(" to ");
  return toISO({ formatQualifier, value }) ?? `${value} (${formatQualifier})`;
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
 * The one transaction set of a given type (ST-01) in an interchange.
 *
 * @param {import("@cosyte/x12").X12Interchange} interchange
 * @param {string} type
 */
function transactionOf(interchange, type) {
  const transaction = interchange.groups
    .flatMap((group) => group.transactions)
    .find((tx) => tx.st.elements[1] === type);
  if (transaction === undefined) throw new Error(`the interchange carries no ${type} transaction set`);
  return transaction;
}

/**
 * Parse an interchange and read its 271 through the typed reader. Besides the subscribers, the
 * reading carries `aaaConditions`: every AAA request-validation segment, the payer saying it could
 * not process the inquiry and why. Read it before the benefits, because a rejected inquiry and a
 * member with no benefit lines both come back with no benefits.
 *
 * @param {string} wire
 */
export function readEligibility(wire) {
  const interchange = parseX12(wire);
  const eligibility = get271Eligibility(interchange.delimiters, transactionOf(interchange, "271"));
  if (eligibility === undefined) throw new Error("get271Eligibility did not read the transaction set");
  return { interchange, eligibility };
}

/**
 * One AAA condition as a line: where the payer placed it, and its reject reason (AAA-03) and
 * follow-up action (AAA-04) codes exactly as sent.
 *
 * @param {import("@cosyte/x12").X12AaaCondition} condition
 * @returns {string}
 */
export function describeRejection({ key, rejectReasonCode, followUpActionCode }) {
  const where = `${key.level ?? "unknown level"}${key.hierarchyId ? ` (HL ${key.hierarchyId})` : ""}`;
  const reason = rejectReasonCode?.code ?? "not stated";
  const action = followUpActionCode?.code ?? "not stated";
  return `${where}: reject reason ${reason}, follow-up action ${action}`;
}

/**
 * TRN-03 of the inquiry: who assigned the trace. It is "1" and an EIN, "3" and a DUNS number, or "9"
 * and an identifier you assign yourself, as this fictional one is.
 */
export const TRACE_ORIGINATOR = "9SYNTHETIC";

/** BHT-03 of the inquiry: the submitter's own identifier for this transaction. Fictional. */
export const INQUIRY_REFERENCE = "SYNTHREQ0001";

/**
 * The 270 inquiry that a 271 answers, as the provider would send it: the provider (information
 * receiver) asks the payer (information source) about one member, for service type 30 (health
 * benefit plan coverage), under a trace the payer echoes back in its 271. @cosyte/synth generates no
 * 270, so we build one with @cosyte/x12's build270 from the parties, member and trace the synthetic
 * 271 names. In your integration the order runs the other way: you build and send the 270, keep its
 * trace, and match the 271 that comes back.
 *
 * build270 writes the BHT header and the HL hierarchy itself, and refuses a spec it cannot emit
 * spec-clean, such as a level with no name or an inquiry that asks for nothing.
 *
 * @param {import("@cosyte/x12").X12Interchange} response the parsed 271 interchange
 * @param {import("@cosyte/x12").X12EligibilitySubscriber} subscriber a subscriber read from it
 * @returns {string} the 270 wire text
 */
export function inquiryFor(response, subscriber) {
  const { informationSource: payer, informationReceiver: provider, name: member } = subscriber;
  const trace = subscriber.traces[0]?.referenceId;
  if (payer === undefined || provider === undefined || member === undefined || trace === undefined) {
    throw new Error("the 271 does not name a payer, a provider, a member and a trace to ask about");
  }
  /** @param {import("@cosyte/x12").X12EligibilityEntity} party */
  const organization = (party) => ({
    entityIdentifierCode: party.entityIdentifierCode,
    entityTypeQualifier: party.entityTypeQualifier,
    lastNameOrOrganizationName: party.name,
    idQualifier: party.idQualifier,
    idCode: party.idCode,
  });
  // ISA-06 is the sender and ISA-08 the receiver, padded to 15. The inquiry travels the other way.
  const isa = response.isa.elements;
  const built = build270({
    envelope: {
      senderId: (isa[8] ?? "").trim(),
      receiverId: (isa[6] ?? "").trim(),
      interchangeDate: isa[9] ?? "",
      interchangeTime: isa[10] ?? "",
      interchangeControlNumber: "000000001",
      groupControlNumber: "1",
      transactionSetControlNumber: "0001",
      usageIndicator: "T", // T marks test data; the builder's default is P, production.
    },
    // BHT-01 (0022) and BHT-02 (13, a request) default; the creation date and time default to GS.
    header: { referenceId: INQUIRY_REFERENCE },
    informationSources: [
      {
        name: organization(payer),
        receivers: [
          {
            name: organization(provider),
            subscribers: [
              {
                traces: [{ traceTypeCode: "1", referenceId: trace, originatingCompanyId: TRACE_ORIGINATOR }],
                name: {
                  entityIdentifierCode: member.entityIdentifierCode,
                  entityTypeQualifier: member.entityTypeQualifier,
                  lastNameOrOrganizationName: member.lastName,
                  firstName: member.firstName,
                  idQualifier: member.idQualifier,
                  idCode: member.idCode,
                  dateOfBirth: member.dateOfBirth,
                  genderCode: member.genderCode,
                },
                inquiries: [{ serviceTypeCodes: [{ code: "30" }] }],
              },
            ],
          },
        ],
      },
    ],
  });
  return serializeX12(built);
}

/**
 * Parse an interchange and read its 270 through the typed inquiry reader.
 *
 * @param {string} wire
 */
export function readInquiry(wire) {
  const interchange = parseX12(wire);
  const inquiry = get270Inquiry(interchange.delimiters, transactionOf(interchange, "270"));
  if (inquiry === undefined) throw new Error("get270Inquiry did not read the transaction set");
  return { interchange, inquiry };
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
