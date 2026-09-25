// @ts-check
import { interpretAck, parseHL7 } from "@cosyte/hl7";
import { createStarterClient, createStarterServer, MllpAckError } from "@cosyte/mllp";
import { generateAdt } from "@cosyte/synth/hl7";

/** The listener binds loopback only, which is also @cosyte/mllp's default. */
export const HOST = "127.0.0.1";

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
 * What the listener reports for one message, read from the parsed model rather than by splitting
 * strings: MSH through `meta`, PID through `patient`, PV1 through `visit`.
 *
 * @param {import("@cosyte/hl7").Hl7Message} message
 */
export function summarizeAdmit(message) {
  const { meta, patient, visit } = message;
  return {
    type: meta.type, // MSH-9, for example ADT^A01
    controlId: meta.controlId, // MSH-10
    patientName: patient?.fullName, // PID-5
    mrn: patient?.mrn, // PID-3, the identifier typed MR
    patientClass: visit?.patientClass, // PV1-2: E emergency, I inpatient, O outpatient (table 0004)
    location: visit?.location, // PV1-3: point of care, room, bed
  };
}

/**
 * The summary as printable lines. A value the message does not carry prints as "(none)".
 *
 * @param {ReturnType<typeof summarizeAdmit>} summary
 * @returns {string[]}
 */
export function formatSummary({ type, controlId, patientName, mrn, patientClass, location }) {
  const place = [
    location?.pointOfCare,
    location?.room && `room ${location.room}`,
    location?.bed && `bed ${location.bed}`,
  ].filter(Boolean);
  const where = place.length > 0 ? place.join(", ") : "(none)";
  return [
    `${type ?? "(none)"}, control id ${controlId ?? "(none)"}`,
    `patient ${patientName ?? "(none)"}, MRN ${mrn ?? "(none)"}`,
    `visit class ${patientClass ?? "(none)"}, location ${where}`,
  ];
}

/**
 * Start an MLLP listener on 127.0.0.1 that parses each message and answers with an HL7 ACK.
 *
 * The ACK is @cosyte/mllp's own auto-ACK. It is on by default and gated on `onMessage`: the server
 * awaits the handler and only then answers AA, with MSA-2 echoing the inbound MSH-10. A throw
 * answers AE instead (AR when the error is an MllpAckError with ackCode "AR"), so a message we
 * could not parse, or do not accept, is never acknowledged as accepted.
 *
 * @param {object} options
 * @param {number} options.port 0 lets the OS pick a free port
 * @param {(summary: ReturnType<typeof summarizeAdmit>) => void | Promise<void>} options.onAdmit
 *   your durable step (a queue, a database): the AA goes out only after it resolves
 * @param {boolean} [options.handleSignals] close the listener on SIGINT or SIGTERM, then exit
 */
export function startListener({ port, onAdmit, handleSignals = false }) {
  return createStarterServer({
    port,
    host: HOST,
    handleSignals,
    onMessage: async (payload) => {
      // parseHL7 throws on a payload with no usable MSH segment, so the sender gets AE.
      const message = parseHL7(payload);
      if (message.meta.messageCode !== "ADT") {
        // AR: the sender should not resend this message unchanged.
        throw new MllpAckError("this listener accepts ADT messages only", { ackCode: "AR" });
      }
      await onAdmit(summarizeAdmit(message));
    },
  });
}

/**
 * Connect an MLLP client for sending. Auto-reconnect is off: this client sends and exits, so a
 * dropped link should fail the pending send rather than reconnect in the background.
 *
 * @param {{ host?: string, port: number }} target
 */
export function connectSender({ host = HOST, port }) {
  return createStarterClient({ host, port, autoReconnect: false, ackTimeoutMs: 10_000 });
}

/**
 * Read an ACK and check it against the message it answers: MSA-1 is the acknowledgement code, and
 * MSA-2 must echo the MSH-10 we sent.
 *
 * @param {string} sent the wire text we sent
 * @param {Buffer} ackBytes the ACK the client received, MLLP framing already stripped
 */
export function readAck(sent, ackBytes) {
  const ack = interpretAck(parseHL7(ackBytes));
  const sentControlId = parseHL7(sent).meta.controlId;
  return {
    code: ack.code, // MSA-1: AA accepted, AE error, AR rejected
    controlId: ack.controlId, // MSA-2
    accepted: ack.accepted,
    correlated: ack.controlId !== undefined && ack.controlId === sentControlId,
    sentControlId,
    segments: ackBytes.toString().split("\r").filter(Boolean),
  };
}
