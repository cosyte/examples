---
id: starter-hl7-mllp-listener
title: Receive HL7 v2 over MLLP and acknowledge it
sidebar_label: hl7-mllp-listener
description: "An MLLP listener that parses each admit message it receives, prints a summary and answers with an ACK, and a client that sends it synthetic messages."
---

# Receive HL7 v2 over MLLP and acknowledge it

The `hl7-mllp-listener` starter receives HL7 v2 admit messages (ADT^A01) over MLLP, parses each one,
prints a short summary, and answers with an HL7 ACK whose `MSA-2` echoes the message's `MSH-10`. A
client in the same starter sends it synthetic messages and checks each answer.

Libraries: [`@cosyte/mllp`](https://docs.cosyte.com/mllp/),
[`@cosyte/hl7`](https://docs.cosyte.com/hl7/), [`@cosyte/synth`](https://docs.cosyte.com/synth/).

## What it shows

- **A listener whose ACK waits for your handler.** `createStarterServer` from `@cosyte/mllp` awaits
  `onMessage` and only then answers `AA`. If the handler throws, the answer is `AE`, or `AR` when it
  throws `MllpAckError` with `ackCode: "AR"`. Your durable write (a queue, a database) goes in the
  handler, so the `AA` never goes out before it finishes.
- **Parsing in the handler.** `parseHL7` from `@cosyte/hl7` reads the bytes, and the summary comes
  from `message.meta` (MSH), `message.patient` (PID) and `message.visit` (PV1). A payload with no
  usable `MSH` is answered `AE`; a message that is not ADT is answered `AR`.
- **A client that checks its answer.** `createStarterClient` sends each message and resolves with
  the ACK that answers it, and `interpretAck` from `@cosyte/hl7` reads `MSA-1` and `MSA-2` from it.
- **A clean shutdown.** The client closes first and the listener second, so no socket stays open.

## Run it

From a clone of [cosyte/examples](https://github.com/cosyte/examples), on Node 22 or later:

```bash
cd examples/hl7-mllp-listener
npm ci
npm start
```

`npm start` starts the listener on a port the OS picks, sends it two synthetic ADT^A01 messages over
one connection, prints what each side saw, and closes both. To run the two sides yourself, use two
terminals:

```bash
npm run server   # listens on 127.0.0.1:2575; set PORT to use another port
npm run send     # sends one synthetic ADT^A01 to 127.0.0.1:2575 and prints the whole ACK
```

`npm run send` also reads `HOST`, `PORT` and `SEED` (the synth seed, 12345 by default), and exits 1
unless the answer is `AA` with a matching `MSA-2`.

`npm test` runs the starter and checks that each message was answered `MSA|AA|` with its own
`MSH-10`. It then starts a real listener on port 0, sends a synthetic admit and reads the ACK bytes,
and checks the negative answers: an `ORU^R01` gets `AR`, a payload that is not HL7 gets `AE`, and
neither reaches the admit handler.

## Before you build on it

- The listener binds `127.0.0.1` only, the `@cosyte/mllp` default, and speaks plain MLLP. To accept
  connections from other machines, bind another address and turn on TLS: an MLLP connection is
  cleartext.
- The summary prints a patient name and an MRN because the data is synthetic. A production listener
  should not write PHI to its logs.
- There is no de-duplication. MLLP with an ACK delivers at least once, so a sender may resend a
  message you already stored: de-duplicate on `MSH-10` plus `MSH-7` in your handler.
- The ACK is the minimal one `@cosyte/mllp` builds from the `MSH` header alone, with no `ERR`
  segment.

## Expected output

What `npm start` prints, as the starter's README gives it. This section and the next are generated from the starter by `scripts/docs-content.mjs`, and CI fails when they no longer match it.

```text
MLLP listener started on 127.0.0.1 (port chosen by the OS).

Client sends a synthetic ADT^A01 from @cosyte/synth (seed 12345):
  MSH|^~\&|COSYTE-SYNTH|SYNTH-FAC|RECEIVER|RECV-FAC|20220305042943||ADT^A01|SYNTH4722901508|P|2.5
  EVN|A01|20220305042943
  PID|1||26068087^^^COSYTE-SYNTH^MR||Quillfeather^Fixtura||19610809|M|||7117 Sample Street^^Synthville^MN^00000||(528) 555-0105||||||969217321
  PV1|1|E|SYNTHWARD^909^01
Listener parsed it:
  ADT^A01, control id SYNTH4722901508
  patient Fixtura Quillfeather, MRN 26068087
  visit class E, location SYNTHWARD, room 909, bed 01
Client received the ACK:
  MSA|AA|SYNTH4722901508
  MSA-1 is AA and MSA-2 matches the MSH-10 sent (SYNTH4722901508)

Client sends a synthetic ADT^A01 from @cosyte/synth (seed 33333):
  MSH|^~\&|COSYTE-SYNTH|SYNTH-FAC|RECEIVER|RECV-FAC|20230420123717||ADT^A01|SYNTH8223032376|P|2.5
  EVN|A01|20230420123717
  PID|1||92347734^^^COSYTE-SYNTH^MR||Reprodus^Synthos||19870107|F|||2169 Example Boulevard^^Synthville^CT^00000||(911) 555-0129||||||936480619
  PV1|1|I|SYNTHWARD^068^01
Listener parsed it:
  ADT^A01, control id SYNTH8223032376
  patient Synthos Reprodus, MRN 92347734
  visit class I, location SYNTHWARD, room 068, bed 01
Client received the ACK:
  MSA|AA|SYNTH8223032376
  MSA-1 is AA and MSA-2 matches the MSH-10 sent (SYNTH8223032376)

2 of 2 messages answered AA, with MSA-2 matching the MSH-10 sent.
Client and listener closed.
```

## Files

The starter's code, every file of `hl7-mllp-listener/` as this release holds it, except its README, its lockfile and its tests, which are in the repository: [hl7-mllp-listener on GitHub](https://github.com/cosyte/examples/tree/main/hl7-mllp-listener).

### package.json

```json title="hl7-mllp-listener/package.json"
{
  "name": "cosyte-example-hl7-mllp-listener",
  "version": "0.0.0",
  "private": true,
  "description": "Receive synthetic HL7 v2 ADT^A01 messages over MLLP, parse each with @cosyte/hl7 and answer with an HL7 ACK.",
  "license": "MIT",
  "type": "module",
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "start": "node src/main.js",
    "server": "node src/server.js",
    "send": "node src/client.js",
    "test": "node --test test/*.test.js test/integration/*.fast.test.js",
    "test:full": "node --test --experimental-test-coverage --test-coverage-include=test/integration/support.js --test-coverage-exclude=node_modules/** --test-coverage-lines=100 --test-coverage-branches=100 --test-coverage-functions=100 test/*.test.js test/integration/*.test.js"
  },
  "dependencies": {
    "@cosyte/hl7": "^0.1.0",
    "@cosyte/mllp": "^0.1.0",
    "@cosyte/synth": "^0.1.0"
  }
}
```

### src/client.js

```js title="hl7-mllp-listener/src/client.js"
// @ts-check
import { connectSender, HOST, readAck, syntheticAdmit } from "./listener.js";

const host = process.env.HOST ?? HOST;
const port = integerFromEnv("PORT", 2575);
const seed = integerFromEnv("SEED", 12345);

const wire = syntheticAdmit(seed);

let client;
try {
  client = await connectSender({ host, port });
} catch {
  console.error(`Could not connect to ${host}:${port}. Start the listener first: npm run server`);
  process.exit(1);
}

try {
  const ack = readAck(wire, await client.send(Buffer.from(wire)));
  console.log(
    `Sent a synthetic ADT^A01 (seed ${seed}, control id ${ack.sentControlId}) to ${host}:${port}.`,
  );
  console.log("ACK received:");
  for (const segment of ack.segments) console.log(`  ${segment}`);
  const match = ack.correlated ? "matches" : "does not match";
  console.log(`MSA-1 is ${ack.code} and MSA-2 ${match} the MSH-10 sent.`);
  if (!ack.accepted || !ack.correlated) process.exitCode = 1;
} finally {
  await client.close();
}

/**
 * @param {string} name
 * @param {number} fallback
 */
function integerFromEnv(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 0) {
    console.error(`${name} must be a non-negative integer, got ${process.env[name]}`);
    process.exit(1);
  }
  return value;
}
```

### src/listener.js

```js title="hl7-mllp-listener/src/listener.js"
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
```

### src/main.js

```js title="hl7-mllp-listener/src/main.js"
// @ts-check
import {
  connectSender,
  formatSummary,
  readAck,
  startListener,
  syntheticAdmit,
} from "./listener.js";

const SEEDS = [12345, 33333];

// Port 0: the OS picks a free port, so the demo never collides with a listener you already run.
const server = await startListener({
  port: 0,
  onAdmit: (summary) => {
    console.log("Listener parsed it:");
    for (const line of formatSummary(summary)) console.log(`  ${line}`);
  },
});
console.log("MLLP listener started on 127.0.0.1 (port chosen by the OS).");

let accepted = 0;
try {
  const { port } = server.getStats();
  if (port === null) throw new Error("the listener did not bind a port");
  const client = await connectSender({ port });
  try {
    for (const seed of SEEDS) {
      const wire = syntheticAdmit(seed);
      console.log(`\nClient sends a synthetic ADT^A01 from @cosyte/synth (seed ${seed}):`);
      for (const segment of wire.split("\r").filter(Boolean)) console.log(`  ${segment}`);

      // send() frames the message, writes it, and resolves with the ACK that answers it.
      const ack = readAck(wire, await client.send(Buffer.from(wire)));

      // The ACK's own MSH-7 (time) and MSH-10 (a fresh id) change on every run: print MSA only.
      console.log("Client received the ACK:");
      console.log(`  ${ack.segments.find((segment) => segment.startsWith("MSA|"))}`);
      const match = ack.correlated ? "matches" : "does not match";
      console.log(
        `  MSA-1 is ${ack.code} and MSA-2 ${match} the MSH-10 sent (${ack.sentControlId})`,
      );
      if (ack.accepted && ack.correlated) accepted += 1;
    }
  } finally {
    // Close the client first, so the listener has no open connection left to drain.
    await client.close();
  }
} finally {
  await server.close();
}

console.log(
  `\n${accepted} of ${SEEDS.length} messages answered AA, with MSA-2 matching the MSH-10 sent.`,
);
console.log("Client and listener closed.");
if (accepted !== SEEDS.length) process.exitCode = 1;
```

### src/server.js

```js title="hl7-mllp-listener/src/server.js"
// @ts-check
import { formatSummary, HOST, startListener } from "./listener.js";

const port = Number(process.env.PORT ?? 2575);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`PORT must be an integer from 0 to 65535, got ${process.env.PORT}`);
  process.exit(1);
}

let server;
try {
  server = await startListener({
    port,
    // The library registers SIGINT and SIGTERM handlers that close the listener, then exit 0.
    handleSignals: true,
    onAdmit: (summary) => {
      console.log("Received:");
      for (const line of formatSummary(summary)) console.log(`  ${line}`);
    },
  });
} catch (error) {
  const code = error instanceof Error && "code" in error ? ` (${error.code})` : "";
  console.error(`Could not listen on ${HOST}:${port}${code}. Set PORT to a free port.`);
  process.exit(1);
}

// Every negative ACK, with a value-free reason: handler-rejected, uncorrelatable-inbound or
// discarded-bytes. The event carries no payload bytes and no control id.
server.on("nack", ({ ackCode, reason }) => console.log(`Answered ${ackCode} (${reason})`));

console.log(`MLLP listener on ${HOST}:${server.getStats().port}. Stop it with Ctrl-C.`);
```
