// @ts-check
// Integration, fast slice: a synthetic 271 from @cosyte/synth and the 270 built for it with
// @cosyte/x12, each parsed, written back unchanged, and read by the typed readers.
import { test } from "node:test";
import { checkEligibilityExchange, seedRange } from "./support.js";

test("271 and the 270 built for it: both round-trip, and the 270 asks about the member the 271 answers", () => {
  for (const seed of seedRange(1, 3)) checkEligibilityExchange(seed);
});
