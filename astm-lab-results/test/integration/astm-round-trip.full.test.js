// @ts-check
// Integration, full suite: the fast slice's round trips over a seed sweep and every result count from
// one to eight.
import { test } from "node:test";
import { checkOrder, checkResultUpload, seedRange } from "./support.js";

const SEEDS = seedRange(1, 100);

test(`${SEEDS.length} seeds, one to eight results each: every upload re-frames byte for byte`, () => {
  for (const seed of SEEDS) {
    for (const resultCount of seedRange(1, 8)) checkResultUpload(seed, resultCount);
  }
});

test(`${SEEDS.length} seeds: every order download round-trips and classifies as orders`, () => {
  for (const seed of SEEDS) checkOrder(seed);
});
