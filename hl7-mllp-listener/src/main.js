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
