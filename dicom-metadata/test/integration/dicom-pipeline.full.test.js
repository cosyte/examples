// @ts-check
// Integration, full suite: many de-identification passes over many UID maps. The remapping is derived
// from the original UIDs, so every pass, with any map, gives the same valid UIDs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { syntheticCtHeader } from "../../src/part10.js";
import { checkDeid, checkUid } from "./support.js";

test("20 UID maps, 10 passes each: every pass round-trips and gives the same valid UIDs", () => {
  const first = checkDeid(syntheticCtHeader(), new Map(), "reference pass");
  checkUid(first.studyInstanceUid, "Study Instance UID");
  for (let map = 0; map < 20; map += 1) {
    const uidMap = new Map();
    for (let pass = 0; pass < 10; pass += 1) {
      assert.deepEqual(checkDeid(syntheticCtHeader(), uidMap, `map ${map} pass ${pass}`), first);
    }
    assert.equal(uidMap.size, 3, "the map holds one entry per remapped UID");
  }
});
