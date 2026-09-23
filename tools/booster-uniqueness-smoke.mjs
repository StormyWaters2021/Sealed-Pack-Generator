import fs from "node:fs";
import { generateCase } from "../dist/engine.js";
import { SeededRandom } from "../dist/random.js";

const config = JSON.parse(fs.readFileSync(new URL("../test-data/games/heroclix/sets/thunderbolts/configs/v2.json", import.meta.url)));
const catalog = JSON.parse(fs.readFileSync(new URL("../test-data/games/heroclix/sets/thunderbolts/catalogs/v1.json", import.meta.url)));

const commonPool = catalog.cards.filter((c) =>
  c.unit_type === "Character" && c.rarity === "Common" && c.prime === false
);
if (commonPool.some((c) => c.collector_number === "007bt")) {
  throw new Error("007bt Bystander leaked into the V2 Common pool");
}

for (let n = 0; n < 1000; n++) {
  const seed = `g2-uniqueness-${n}`;
  const generated = generateCase(1, config, catalog, new SeededRandom(seed));
  for (const brick of generated.bricks) {
    for (const booster of brick.boosters) {
      const pulls = [...booster.cards, ...booster.extras];
      const ids = pulls.map((c) => c.model_id);
      if (new Set(ids).size !== ids.length) {
        throw new Error(`Duplicate pull in seed ${seed}, brick ${brick.brick_index}, booster ${booster.booster_index}`);
      }
      if (pulls.some((c) => c.unit_type === "Bystander")) {
        throw new Error(`Bystander pull in seed ${seed}, brick ${brick.brick_index}, booster ${booster.booster_index}`);
      }
    }
  }
}
console.log("G2 booster uniqueness/Bystander regression test passed (1,000 cases). ");
