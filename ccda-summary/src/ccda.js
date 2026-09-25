// @ts-check
import { ICD10_CM, LOINC, NCI_ROUTE, NDC, RXNORM, SNOMED_CT, UNII, serializeCcda } from "@cosyte/ccda";
import { generateCcd } from "@cosyte/synth/ccda";

/** @typedef {import("@cosyte/ccda").CcdaDocument} CcdaDocument */
/** @typedef {import("@cosyte/ccda").CD} CD */

// A C-CDA code names its code system by OID. @cosyte/ccda exports the OIDs; we add the names.
const CODE_SYSTEM_NAMES = new Map([
  [SNOMED_CT, "SNOMED CT"],
  [ICD10_CM, "ICD-10-CM"],
  [RXNORM, "RxNorm"],
  [LOINC, "LOINC"],
  [NCI_ROUTE, "NCI Thesaurus"],
  [NDC, "NDC"],
  [UNII, "UNII"],
]);

/**
 * A synthetic Continuity of Care Document as the XML a sending system would hand you. The same seed
 * gives the same bytes on every machine.
 *
 * @param {number} seed
 * @returns {string}
 */
export function syntheticCcdXml(seed) {
  return serializeCcda(generateCcd({ seed }));
}

/**
 * "SNOMED CT 44054006" for a coded value, or undefined when it carries no code.
 *
 * @param {CD | undefined} cd
 */
export function codeLabel(cd) {
  if (cd?.code === undefined) return undefined;
  const system = cd.codeSystem === undefined ? undefined : CODE_SYSTEM_NAMES.get(cd.codeSystem);
  return `${system ?? cd.codeSystemName ?? cd.codeSystem ?? "no code system"} ${cd.code}`;
}

/**
 * The date part of an HL7 v3 timestamp as YYYY-MM-DD (or YYYY-MM, or YYYY, at the precision sent).
 *
 * @param {import("@cosyte/ccda").TS | undefined} ts
 */
export function v3Date(ts) {
  const [, year, month, day] = /^(\d{4})(\d{2})?(\d{2})?/.exec(ts?.raw ?? "") ?? [];
  return year === undefined ? undefined : [year, month, day].filter(Boolean).join("-");
}

/**
 * "every 8 h" for a periodic frequency (PIVL_TS), in the period and UCUM unit the document sent.
 *
 * @param {import("@cosyte/ccda").MedicationFrequency | undefined} frequency
 */
function every(frequency) {
  const period = frequency?.period;
  return period?.raw === undefined ? undefined : `every ${period.raw}${period.unit ? ` ${period.unit}` : ""}`;
}

/**
 * The document type, patient and reconciliation triad of a parsed C-CDA, read with the typed section
 * accessors. Nothing absent is filled in: a missing value stays undefined.
 *
 * @param {CcdaDocument} doc
 */
export function summarize(doc) {
  const patient = doc.getPatient();
  return {
    documentType: doc.documentType,
    documentCode: codeLabel(doc.header.code),
    documentTitle: doc.header.code?.displayName ?? doc.header.title,
    patient: {
      name: [...(patient?.name?.given ?? []), patient?.name?.family].filter(Boolean).join(" ") || undefined,
      mrn: doc.getMrn(),
      birthDate: v3Date(patient?.birthTime),
      gender: patient?.genderCode?.code,
    },
    // A Problem Concern Act wraps one or more Problem Observations; the concern carries the status.
    problems: doc.getProblems().flatMap((concern) =>
      concern.problems.map((problem) => ({
        name: problem.value?.displayName,
        code: codeLabel(problem.value),
        status: concern.status,
        onset: v3Date(problem.effectiveTime?.low),
      })),
    ),
    medications: doc.getMedications().map((med) => ({
      name: med.drug?.displayName,
      code: codeLabel(med.drug),
      dose: med.dose && [med.dose.raw, med.dose.unit].filter(Boolean).join(" "),
      route: med.route?.displayName,
      frequency: every(med.frequency),
      status: med.statusCode,
    })),
    // An Allergy Concern Act wraps the observations. The substance is the allergen, not the
    // observation value (that is the allergy type), and each reaction may carry its own severity.
    allergies: doc.getAllergies().flatMap((concern) =>
      concern.allergies.map((allergy) => ({
        substance: allergy.noKnownAllergy ? "No known allergies" : allergy.allergen?.displayName,
        code: codeLabel(allergy.allergen),
        reactions: allergy.reactions.map((reaction) => ({
          manifestation: reaction.manifestation?.displayName,
          severity: reaction.severity?.displayName,
        })),
        status: concern.status,
      })),
    ),
  };
}
