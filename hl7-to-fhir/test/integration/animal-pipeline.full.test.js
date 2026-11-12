// @ts-check
// Integration, full suite: the fast slice's animal pipeline over a seed sweep of every animal ADT
// trigger, each message sent over the same real MLLP link on 127.0.0.1.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ANIMAL_TRIGGERS, animalAdt, checkAnimal, seedRange, sendAnimals } from "./support.js";

const SEEDS = seedRange(1, 250);

for (const trigger of ANIMAL_TRIGGERS) {
  test(`ADT^${trigger}, ${SEEDS.length} animal seeds: species and breed carried or declared at every step, no identifier left`, { timeout: 120_000 }, async () => {
    const wires = SEEDS.map((seed) => animalAdt(seed, trigger));
    const { acks, receipts } = await sendAnimals(wires);
    assert.equal(receipts.length, wires.length, "every message reached the receiving pipeline");
    wires.forEach((wire, index) => checkAnimal(wire, acks[index], receipts[index], `ADT^${trigger} seed ${SEEDS[index]}`));
  });
}
