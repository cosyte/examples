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
