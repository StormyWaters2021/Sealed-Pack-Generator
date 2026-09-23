import fs from "node:fs";
import { generateCase } from "../dist/engine.js";
import { SeededRandom } from "../dist/random.js";

const config = JSON.parse(
  fs.readFileSync(
    new URL("../test-data/games/heroclix/sets/thunderbolts/configs/v1.json", import.meta.url),
  ),
);

const catalog = JSON.parse(
  fs.readFileSync(
    new URL("../test-data/games/heroclix/sets/thunderbolts/catalogs/v1.json", import.meta.url),
  ),
);

let sawZero = false;
let sawTwo = false;

for (let caseIndex = 0; caseIndex < 50; caseIndex++) {
  const result = generateCase(
    1,
    config,
    catalog,
    new SeededRandom(`v2-extras-${caseIndex}`),
  );

  for (const brick of result.bricks) {
    let oneShots = 0;
    let terrain = 0;

    for (const booster of brick.boosters) {
      const count = booster.extras.length;

      if (count > 2) {
        throw new Error("V1 generated more than 2 inserts in one booster");
      }

      if (count === 0) sawZero = true;
      if (count === 2) sawTwo = true;

      for (const extra of booster.extras) {
        if (extra.category === "one_shot") oneShots++;
        if (extra.category === "terrain") terrain++;
      }
    }

    if (oneShots !== 8) {
      throw new Error(`Expected 8 One-Shots, got ${oneShots}`);
    }

    if (terrain !== 4) {
      throw new Error(`Expected 4 terrain, got ${terrain}`);
    }
  }
}

if (!sawZero || !sawTwo) {
  throw new Error("Bounded random placement never produced both zero- and two-insert boosters");
}

console.log("V1 insert placement smoke test passed.");
