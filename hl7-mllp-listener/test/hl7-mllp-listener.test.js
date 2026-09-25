// @ts-check
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { parseHL7 } from "@cosyte/hl7";
import { generateOru } from "@cosyte/synth/hl7";
import { connectSender, startListener, summarizeAdmit, syntheticAdmit } from "../src/listener.js";

const run = promisify(execFile);
const starterDir = fileURLToPath(new URL("..", import.meta.url));

/**
 * MSA-1 and MSA-2 read straight from the ACK bytes, independent of the helpers under test.
 *
 * @param {Buffer} ackBytes
 */
function msaOf(ackBytes) {
  const msa = ackBytes
    .toString()
    .split("\r")
    .find((segment) => segment.startsWith("MSA|"));
  assert.ok(msa, "the ACK has an MSA segment");
  const [, code, controlId] = msa.split("|");
  return { code, controlId };
}

/**
 * Start a real listener on port 0, connect a client, run `body`, then close both, client first.
 *
 * @param {(client: import("@cosyte/mllp").MllpClient, received: object[]) => Promise<void>} body
 */
async function withListener(body) {
  /** @type {object[]} */
  const received = [];
  const server = await startListener({
    port: 0,
    onAdmit: (summary) => void received.push(summary),
  });
  try {
    const { port } = server.getStats();
    assert.ok(port, "the listener is bound to a port");
    const client = await connectSender({ port });
    try {
      await body(client, received);
    } finally {
      await client.close();
    }
  } finally {
    await server.close();
  }
}

test(
  "npm start sends two admits and prints an accepted, correlated ACK for each",
  { timeout: 30_000 },
  async () => {
    const { stdout } = await run(process.execPath, ["src/main.js"], {
      cwd: starterDir,
      timeout: 25_000,
    });

    for (const seed of [12345, 33333]) {
      const input = parseHL7(syntheticAdmit(seed));
      assert.match(stdout, new RegExp(`^  MSA\\|AA\\|${input.meta.controlId}$`, "m"));
      assert.match(
        stdout,
        new RegExp(`^  patient ${input.patient?.fullName}, MRN ${input.patient?.mrn}$`, "m"),
      );
    }
    assert.match(stdout, /^2 of 2 messages answered AA/m);
  },
);

test(
  "the listener answers AA and MSA-2 echoes the MSH-10 it was sent",
  { timeout: 15_000 },
  async () => {
    const wire = syntheticAdmit(4242);
    const input = parseHL7(wire);

    await withListener(async (client, received) => {
      const ack = msaOf(await client.send(Buffer.from(wire)));
      assert.equal(ack.code, "AA");
      assert.equal(ack.controlId, input.meta.controlId);
      assert.equal(ack.controlId, input.get("MSH.10"));
      // The listener saw what was sent: the summary matches the parsed input.
      assert.deepEqual(received, [summarizeAdmit(input)]);
    });
  },
);

test(
  "the listener answers AR for a message that is not ADT and AE for one it cannot parse",
  { timeout: 15_000 },
  async () => {
    const oru = generateOru({ seed: 7 }).toString();

    await withListener(async (client, received) => {
      const rejected = msaOf(await client.send(Buffer.from(oru)));
      assert.equal(rejected.code, "AR");
      assert.equal(rejected.controlId, parseHL7(oru).meta.controlId);

      const unparseable = msaOf(await client.send(Buffer.from("this is not an HL7 message")));
      assert.equal(unparseable.code, "AE");

      assert.deepEqual(received, [], "onAdmit ran for neither message");
    });
  },
);
