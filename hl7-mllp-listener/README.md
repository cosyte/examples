# hl7-mllp-listener

Receive HL7 v2 admit messages over MLLP with [`@cosyte/mllp`](https://github.com/cosyte/mllp), parse
each one with [`@cosyte/hl7`](https://github.com/cosyte/hl7), print a short summary, and answer with
an HL7 ACK whose `MSA-2` echoes the message's `MSH-10`. The summary is safe to log: the message type,
its control id and the visit class, and for the patient's name, record number and location only
whether each is there. Neither side prints a message or a segment.

Libraries: [`@cosyte/mllp`](https://github.com/cosyte/mllp),
[`@cosyte/hl7`](https://github.com/cosyte/hl7), [`@cosyte/synth`](https://github.com/cosyte/synth).

## Run it

```bash
npm install
npm start
```

Node 22 or later. `npm start` starts the listener on a port the OS picks, sends it two synthetic
ADT^A01 messages over one connection, prints what each side saw, and closes both.

To run the two sides yourself, use two terminals:

```bash
npm run server   # listens on 127.0.0.1:2575; set PORT to use another port
npm run send     # sends one synthetic ADT^A01 to 127.0.0.1:2575 and prints the ACK's codes
```

`npm run send` also reads `HOST`, `PORT`, and `SEED` (the synth seed, default 12345), and exits 1
unless the answer is `AA` with a matching `MSA-2`.

## Expected output

```text
MLLP listener started on 127.0.0.1 (port chosen by the OS).

Client sends a synthetic ADT^A01 from @cosyte/synth (seed 12345):
  segments MSH EVN PID PV1, 285 characters
Listener parsed it:
  ADT^A01, control id SYNTH4722901508
  patient name present, MRN present
  visit class E, location given (point of care, room, bed)
Client received the ACK:
  segments MSH MSA
  MSA-1 is AA and MSA-2 matches the MSH-10 sent (SYNTH4722901508)

Client sends a synthetic ADT^A01 from @cosyte/synth (seed 33333):
  segments MSH EVN PID PV1, 285 characters
Listener parsed it:
  ADT^A01, control id SYNTH8223032376
  patient name present, MRN present
  visit class I, location given (point of care, room, bed)
Client received the ACK:
  segments MSH MSA
  MSA-1 is AA and MSA-2 matches the MSH-10 sent (SYNTH8223032376)

2 of 2 messages answered AA, with MSA-2 matching the MSH-10 sent.
Client and listener closed.
```

The listener's port is not printed because the OS picks a new one on every run. The ACK's own
`MSH-7` (a timestamp) and `MSH-10` (a fresh control id) also change on every run, so the demo prints
only the ACK's segment names and the codes of its `MSA` segment.

## Test

```bash
npm test
```

The test runs `src/main.js` and checks that each message was answered `AA` with `MSA-2` matching its
`MSH-10`, and that the output holds no value from `PID` and no segment of the message. It then
starts a real listener on port 0, sends a synthetic admit, and reads the ACK bytes: `MSA-1` is `AA`
and `MSA-2` equals the `MSH-10` that was sent. Last, it checks the negative answers: an `ORU^R01`
gets `AR`, a payload that is not HL7 gets `AE`, and neither one reaches the admit handler.

The test opens real sockets, always on port 0. `InMemoryTransport` from `@cosyte/mllp/testing`
drives a `Connection` or a `FrameReader` with no socket at all, but an `MllpServer` accepts only real
connections, and the auto-ACK path lives in the server.

## Integration tests

`npm test` also runs the fast integration tests, `test/integration/*.fast.test.js`. `npm run test:full`
runs every test, the seed sweeps in `test/integration/*.full.test.js` included, and fails unless the
helpers in `test/integration/support.js` are fully covered. They call the libraries' public APIs only,
on synthetic data.

- Every HL7 v2 message kind `@cosyte/synth` generates (ADT^A01, ADT^A04, ADT^A08, ORU^R01,
  ORM^O01, SIU^S12, VXU^V04) crosses a real MLLP link on `127.0.0.1`: the listener receives the
  bytes that were sent, `@cosyte/hl7` parses them back to the same text, and each ACK is AA with
  MSA-2 equal to the MSH-10 sent.
- The starter's own listener reads each ADT trigger into the same summary as the parsed input.
- The full suite sends 150 seeds of every kind over one link, then 200 messages from four senders at
  once, and checks that every message arrives once, unchanged, and that each sender gets its own ACKs.

## How it works

1. `generateAdt({ seed, trigger: "A01" })` from `@cosyte/synth/hl7` builds each admit message. The
   same seed gives the same bytes everywhere.
2. `createStarterServer({ port, host, onMessage })` from `@cosyte/mllp` starts the listener. Its
   auto-ACK is on by default and gated on your handler: the server awaits `onMessage` and only then
   answers `AA`, with `MSA-2` echoing `MSH-10` byte for byte. If the handler throws, the answer is
   `AE`, or `AR` when it throws `MllpAckError` with `ackCode: "AR"`. Put your durable write (a
   queue, a database) in the handler: the `AA` never goes out before it finishes.
3. In the handler, `parseHL7(payload)` from `@cosyte/hl7` parses the bytes, and the summary reads
   `message.meta` (MSH), `message.patient` (PID), and `message.visit` (PV1). A payload with no
   usable `MSH` makes `parseHL7` throw, so it is answered `AE`. A message that is not ADT is
   answered `AR`.
4. `createStarterClient({ host, port })` connects, with auto-reconnect off because this client
   sends and exits. `client.send(bytes)` frames the message, writes it, and resolves with the ACK
   that answers it. `interpretAck` from `@cosyte/hl7` reads `MSA-1` and `MSA-2` from that ACK.
5. `src/main.js` closes the client first and the listener second, so no socket stays open and the
   process exits 0. `npm run server` passes `handleSignals: true`, so Ctrl-C closes the listener.

The code is in [`src/listener.js`](src/listener.js) (the listener, the summary, and the ACK check),
[`src/main.js`](src/main.js), [`src/server.js`](src/server.js), and
[`src/client.js`](src/client.js).

## Limits

- The listener binds `127.0.0.1` only, which is the `@cosyte/mllp` default, and speaks plain MLLP.
  To accept connections from other machines, bind another address (a wildcard such as `0.0.0.0`
  also needs `allowWildcardBind: true`) and turn on TLS, because an MLLP connection is cleartext:
  see the [`@cosyte/mllp` README](https://github.com/cosyte/mllp).
- The summary says whether a patient name and an MRN are there and never prints them, synthetic as
  they are. A production listener should not write PHI to its logs either.
- The ACK is the minimal one `@cosyte/mllp` builds from the `MSH` header alone: `MSH-9` is `ACK`
  and there is no `ERR` segment. For an ACK built by `@cosyte/hl7`'s builder, with `ERR` segments,
  `@cosyte/mllp/ack-from-hl7` has `buildMllpAck`. Using it means passing `autoAck` as a function,
  and then your code, not the commit gate, decides the ACK code.
- There is no de-duplication. MLLP with an ACK delivers at least once, so a sender may resend a
  message you already stored. De-duplicate on `MSH-10` plus `MSH-7` in your handler.

## Synthetic data

The messages come from `@cosyte/synth`, which draws every name, identifier, date, phone, and
address from reserved or fictional ranges. It is not real patient data.

## Versions

The `@cosyte/*` versions are set in [`package.json`](package.json). After changing one, run
`npm install` to refresh `package-lock.json`, then `npm test`.

Need it built, or hosted and run for you? [Talk to us](https://cosyte.com/integration-services?utm_source=github&utm_medium=readme&utm_campaign=evergreen&utm_content=examples).
