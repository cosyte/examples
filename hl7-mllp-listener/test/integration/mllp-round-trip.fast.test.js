// @ts-check
// Integration, fast slice: every HL7 v2 message kind @cosyte/synth generates crosses a real MLLP link
// on 127.0.0.1 and comes back out of @cosyte/hl7 unchanged, answered by a correlated AA.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHL7 } from "@cosyte/hl7";
import { connectSender, startListener, summarizeAdmit } from "../../src/listener.js";
import { HOST, MESSAGE_KINDS, msaOf, seedRange, withRecordingLink } from "./support.js";

const SEEDS = seedRange(1, 2);

test("every synthetic message kind crosses the link byte for byte and parses back to the same text", { timeout: 30_000 }, async () => {
  await withRecordingLink(1, async ([sender], received, stats) => {
    assert.equal(stats.host, HOST, "the listener is bound to loopback only");
    /** @type {string[]} */
    const sent = [];
    for (const [kind, generate] of Object.entries(MESSAGE_KINDS)) {
      for (const seed of SEEDS) {
        const wire = generate(seed);
        const input = parseHL7(wire);
        assert.equal(`${input.meta.messageCode}^${input.meta.triggerEvent}`, kind);

        const ack = msaOf(await sender.send(Buffer.from(wire)));
        assert.equal(ack.code, "AA", `${kind} seed ${seed} was not accepted`);
        assert.equal(ack.controlId, input.meta.controlId, `${kind} seed ${seed}: MSA-2 does not echo MSH-10`);
        sent.push(wire);
      }
    }
    assert.equal(received.length, sent.length);
    received.forEach((payload, index) => {
      assert.equal(payload.toString(), sent[index], `message ${index} changed in transit`);
      assert.equal(parseHL7(payload).toString(), sent[index], `message ${index} does not serialize back to what was sent`);
    });
  });
});

test("the starter's listener reads every synthetic ADT trigger it accepts into the same summary", { timeout: 30_000 }, async () => {
  /** @type {object[]} */
  const summaries = [];
  const server = await startListener({ port: 0, onAdmit: (summary) => void summaries.push(summary) });
  try {
    const { host, port } = server.getStats();
    assert.equal(host, HOST);
    assert.ok(port);
    await withSender(port, async (sender) => {
      /** @type {object[]} */
      const expected = [];
      for (const kind of ["ADT^A01", "ADT^A04", "ADT^A08"]) {
        const wire = MESSAGE_KINDS[kind](SEEDS[0]);
        assert.equal(msaOf(await sender.send(Buffer.from(wire))).code, "AA", `${kind} was not accepted`);
        expected.push(summarizeAdmit(parseHL7(wire)));
      }
      assert.deepEqual(summaries, expected);
    });
  } finally {
    await server.close();
  }
});

/**
 * @param {number} port
 * @param {(sender: import("@cosyte/mllp").MllpClient) => Promise<void>} body
 */
async function withSender(port, body) {
  const sender = await connectSender({ port });
  try {
    await body(sender);
  } finally {
    await sender.close();
  }
}
