import fs from "node:fs";
import { generateCase } from "../dist/engine.js";
import { SeededRandom } from "../dist/random.js";

const config = JSON.parse(fs.readFileSync(new URL("../test-data/games/heroclix/sets/thunderbolts/configs/v3.json", import.meta.url)));
const catalog = JSON.parse(fs.readFileSync(new URL("../test-data/games/heroclix/sets/thunderbolts/catalogs/v1.json", import.meta.url)));
const legacyIds = new Set(catalog.cards.filter((c) => c.unit_type === "Legacy Card").map((c) => c.model_id));
if (legacyIds.size !== 16) throw new Error(`Expected 16 Legacy Cards, found ${legacyIds.size}`);

for (let n = 0; n < 1000; n++) {
  const generated = generateCase(1, config, catalog, new SeededRandom(`topper-smoke-${n}`));
  if (generated.bricks.length !== 2) throw new Error("Expected two bricks per case");
  for (const brick of generated.bricks) {
    if (!brick.toppers || brick.toppers.length !== 1) throw new Error("Expected exactly one brick topper");
    const topper = brick.toppers[0];
    if (topper.category !== "brick_topper") throw new Error("Wrong topper category");
    if (!legacyIds.has(topper.model_id)) throw new Error("Non-Legacy Card selected as brick topper");
    for (const booster of brick.boosters) {
      const ids = [...booster.cards, ...(booster.extras || [])].map((c) => c.model_id);
      if (ids.some((id) => legacyIds.has(id))) throw new Error("Legacy Card leaked into a pack");
    }
  }
}
console.log("Brick topper smoke test passed (1,000 cases).");
