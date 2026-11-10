// @ts-check
// Shared by the integration tests: synthetic messages of every kind @cosyte/synth generates, and a
// real MLLP link on 127.0.0.1 that records the bytes it received.
import assert from "node:assert/strict";
import { createStarterClient, createStarterServer } from "@cosyte/mllp";
import { generateAdt, generateOrm, generateOru, generateSiu, generateVxu } from "@cosyte/synth/hl7";

/** The listener binds loopback only, in the tests as in the starter. */
export const HOST = "127.0.0.1";

/**
 * One generator per message kind, each returning HL7 v2 wire text. The same seed gives the same bytes
 * on every machine, and every value comes from @cosyte/synth's synthetic pools.
 *
 * @type {Readonly<Record<string, (seed: number) => string>>}
 */
export const MESSAGE_KINDS = Object.freeze({
  "ADT^A01": (seed) => generateAdt({ seed, trigger: "A01" }).toString(),
  "ADT^A04": (seed) => generateAdt({ seed, trigger: "A04" }).toString(),
  "ADT^A08": (seed) => generateAdt({ seed, trigger: "A08" }).toString(),
  "ORU^R01": (seed) => generateOru({ seed }).toString(),
  "ORM^O01": (seed) => generateOrm({ seed }).toString(),
  "SIU^S12": (seed) => generateSiu({ seed }).toString(),
  "VXU^V04": (seed) => generateVxu({ seed }).toString(),
});

/**
 * The seeds from `first` to `first + count - 1`.
 *
 * @param {number} first
 * @param {number} count
 * @returns {number[]}
 */
export function seedRange(first, count) {
  return Array.from({ length: count }, (_, index) => first + index);
}

/**
 * MSA-1 and MSA-2 read straight from the ACK bytes.
 *
 * @param {Buffer} ackBytes
 */
export function msaOf(ackBytes) {
  const msa = ackBytes
    .toString()
    .split("\r")
    .find((segment) => segment.startsWith("MSA|"));
  assert.ok(msa, "the ACK has an MSA segment");
  const [, code, controlId] = msa.split("|");
  return { code, controlId };
}

/**
 * Start an MLLP listener on 127.0.0.1 that keeps every payload it receives, connect `clients` senders
 * to it, run `body`, then close the senders and the listener. The listener answers with
 * @cosyte/mllp's own commit-gated AA once the payload is recorded.
 *
 * @param {number} clients
 * @param {(senders: import("@cosyte/mllp").MllpClient[], received: Buffer[], stats: { host: string | null, port: number | null }) => Promise<void>} body
 */
export async function withRecordingLink(clients, body) {
  /** @type {Buffer[]} */
  const received = [];
  const server = await createStarterServer({
    port: 0,
    host: HOST,
    onMessage: (payload) => void received.push(Buffer.from(payload)),
  });
  try {
    const { host, port } = server.getStats();
    assert.ok(port, "the listener is bound to a port");
    /** @type {import("@cosyte/mllp").MllpClient[]} */
    const senders = [];
    try {
      for (let index = 0; index < clients; index += 1) {
        senders.push(await createStarterClient({ host: HOST, port, autoReconnect: false, ackTimeoutMs: 10_000 }));
      }
      await body(senders, received, { host, port });
    } finally {
      await Promise.all(senders.map((sender) => sender.close()));
    }
  } finally {
    await server.close();
  }
}
