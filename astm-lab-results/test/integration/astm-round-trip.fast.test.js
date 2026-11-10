// @ts-check
// Integration, fast slice: synthetic ASTM uploads from @cosyte/synth, decoded and re-framed by
// @cosyte/astm byte for byte, and synthetic order downloads round-tripped as record text.
import { test } from "node:test";
import { checkOrder, checkResultUpload, seedRange } from "./support.js";

test("a framed result upload decodes, re-frames byte for byte, and reads back to the same results table", () => {
  for (const seed of seedRange(1, 3)) checkResultUpload(seed, 3);
});

test("an order download round-trips as record text and classifies as orders", () => {
  for (const seed of seedRange(1, 3)) checkOrder(seed);
});
