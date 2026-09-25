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
