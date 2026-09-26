// @ts-check
import {
  isComplex,
  isList,
  isPrimitive,
  resolvePath,
  resourceType,
  STARTER_PROFILES,
  validateResource,
} from "@cosyte/fhir";
import { parseHL7 } from "@cosyte/hl7";
import { generateAdt } from "@cosyte/synth/hl7";
import { createNamingSystem, toFhir } from "@cosyte/transform";

/** @typedef {import("@cosyte/fhir").FhirComplex} FhirComplex */
/** @typedef {import("@cosyte/fhir").FhirNode} FhirNode */
/** @typedef {import("@cosyte/fhir").ValidationIssue} ValidationIssue */

/**
 * The identifier system for MRNs issued under the synthetic assigning authority COSYTE-SYNTH.
 * The transform never derives a system URI from a bare namespace, so you map each authority your
 * feed uses to a URI you control. The example.org domain marks this one as fictional.
 */
export const MRN_SYSTEM = "https://example.org/fhir/sid/synthetic-mrn";

/**
 * Build a synthetic ADT^A01 (admit) message. The same seed gives the same bytes on every machine,
 * and every name, identifier, date and address comes from @cosyte/synth's synthetic pools.
 *
 * @param {number} seed
 * @returns {string} the HL7 v2 wire text, segments separated by carriage returns
 */
export function syntheticAdmit(seed) {
  return generateAdt({ seed, trigger: "A01" }).toString();
}

/**
 * Parse an HL7 v2 message and convert it to a FHIR R4 message Bundle.
 *
 * @param {string} wire
 */
export function convertToFhir(wire) {
  const message = parseHL7(wire);
  let next = 0;
  const { bundle, issues } = toFhir(message, {
    namingSystem: createNamingSystem({ authorities: { "COSYTE-SYNTH": MRN_SYSTEM } }),
    // Numbered entry ids keep the output identical from run to run. Leave generateId out in
    // production: the transform then mints each fullUrl with crypto.randomUUID.
    generateId: () => `00000000-0000-4000-8000-${String(++next).padStart(12, "0")}`,
  });
  return { message, bundle, issues };
}

/**
 * The nodes an element path selects, in document order.
 *
 * `resolvePath` flattens the repeating elements it walks through, but with @cosyte/fhir 0.1.0 a
 * repeating element named by the last segment (`entry`, `name.given`) comes back as one list node
 * rather than its items, so we flatten that list here too.
 *
 * @param {FhirNode} node
 * @param {string} path a dotted element path, for example "name.given"
 * @returns {FhirNode[]}
 */
export function nodesAt(node, path) {
  return resolvePath(node, path).flatMap((found) => (isList(found) ? found.items : [found]));
}

/**
 * The string values an element path selects, in document order. Reading through the model keeps
 * every value exactly as the transform wrote it.
 *
 * @param {FhirNode} node
 * @param {string} path a dotted element path, for example "name.family"
 * @returns {string[]}
 */
export function stringsAt(node, path) {
  return nodesAt(node, path).flatMap((found) =>
    isPrimitive(found) && typeof found.value === "string" ? [found.value] : [],
  );
}

/**
 * The Bundle's entries in order: fullUrl, resource type and the resource itself.
 *
 * @param {FhirComplex} bundle
 * @returns {{ fullUrl: string | undefined, type: string, resource: FhirComplex }[]}
 */
export function bundleEntries(bundle) {
  return nodesAt(bundle, "entry").flatMap((entry) => {
    const [resource] = nodesAt(entry, "resource");
    if (resource === undefined || !isComplex(resource)) return [];
    return [
      {
        fullUrl: stringsAt(entry, "fullUrl")[0],
        type: resourceType(resource) ?? "(unknown)",
        resource,
      },
    ];
  });
}

/**
 * Validate the Bundle and every resource in it with @cosyte/fhir.
 *
 * `validateResource` on a Bundle checks the Bundle itself (entry fullUrls, references between
 * entries) and the safety rules that apply anywhere, but not each entry's own resource rules, so
 * each entry is validated on its own too. Strict mode suits output you are about to send on: an
 * element the schema does not define is an error. The starter-kit profiles add, for Patient, a
 * required identifier.system and identifier.value.
 *
 * @param {FhirComplex} bundle
 * @returns {{ type: string, issues: readonly ValidationIssue[] }[]}
 */
export function validateBundle(bundle) {
  /** @type {import("@cosyte/fhir").ValidateOptions} */
  const options = { mode: "strict", profiles: STARTER_PROFILES };
  const targets = [{ type: "Bundle", resource: bundle }, ...bundleEntries(bundle)];
  return targets.map(({ type, resource }) => ({
    type,
    issues: validateResource(resource, options).issues,
  }));
}

/**
 * Issue counts by severity.
 *
 * @param {readonly { severity: string }[]} issues
 */
export function countBySeverity(issues) {
  /** @type {Record<"fatal" | "error" | "warning" | "information", number>} */
  const counts = { fatal: 0, error: 0, warning: 0, information: 0 };
  for (const { severity } of issues) {
    if (Object.hasOwn(counts, severity)) counts[/** @type {keyof typeof counts} */ (severity)] += 1;
  }
  return counts;
}
