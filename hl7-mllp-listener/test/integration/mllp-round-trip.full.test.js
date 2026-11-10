// @ts-check
// Integration, full suite: a seed sweep of every synthetic message kind over one MLLP link, then
// several senders at once on the same listener, every message accounted for exactly once.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseHL7 } from "@cosyte/hl7";
import { MESSAGE_KINDS, msaOf, seedRange, withRecordingLink } from "./support.js";

test("a seed sweep of every message kind crosses one link unchanged, each answered AA", { timeout: 120_000 }, async () => {
  await withRecordingLink(1, async ([sender], received) => {
    /** @type {string[]} */
    const sent = [];
    for (const generate of Object.values(MESSAGE_KINDS)) {
      for (const seed of seedRange(1, 150)) {
        const wire = generate(seed);
        const ack = msaOf(await sender.send(Buffer.from(wire)));
        assert.equal(ack.code, "AA");
        assert.equal(ack.controlId, parseHL7(wire).meta.controlId);
        sent.push(wire);
      }
    }
    assert.deepEqual(
      received.map((payload) => payload.toString()),
      sent,
    );
  });
});

test("four senders at once: every message arrives once, unchanged, and each sender gets its own ACKs", { timeout: 120_000 }, async () => {
  await withRecordingLink(4, async (senders, received) => {
    const kinds = Object.values(MESSAGE_KINDS);
    const perSender = senders.map((_, index) =>
      seedRange(1000 + index * 50, 50).map((seed, offset) => kinds[(index + offset) % kinds.length](seed)),
    );
    await Promise.all(
      senders.map(async (sender, index) => {
        for (const wire of perSender[index]) {
          const ack = msaOf(await sender.send(Buffer.from(wire)));
          assert.equal(ack.code, "AA");
          assert.equal(ack.controlId, parseHL7(wire).meta.controlId, "an ACK went to the wrong sender");
        }
      }),
    );
    const sent = perSender.flat();
    assert.deepEqual(
      received.map((payload) => payload.toString()).sort(),
      [...sent].sort(),
    );
  });
});
