import fs from "node:fs";
import { generateForRequest } from "../dist/engine.js";
import { SeededRandom } from "../dist/random.js";

const config = JSON.parse(fs.readFileSync(new URL("../test-data/games/heroclix/sets/thunderbolts/configs/v1.json", import.meta.url)));
const catalog = JSON.parse(fs.readFileSync(new URL("../test-data/games/heroclix/sets/thunderbolts/catalogs/v1.json", import.meta.url)));

const result = generateForRequest(
  { set: "thunderbolts", request: { kind: "cases", count: 1 }, seed: "smoke-test", debug: true },
  config,
  catalog,
  new SeededRandom("smoke-test")
);

const c = result.generated_cases[0];
if (c.bricks.length !== 2) throw new Error("Expected 2 bricks");
for (const brick of c.bricks) {
  if (brick.boosters.length !== 12) throw new Error("Expected 12 boosters per brick");
  for (const booster of brick.boosters) {
    if (booster.cards.length !== 5) throw new Error("Expected 5 game pieces per booster");
  }
  const s = brick.summary;
  if (s.character_sr !== 3) throw new Error("Expected exactly 3 character SR slots");
  if (s.standard_chase !== 1) throw new Error("Expected exactly 1 standard Chase");
  if ((s["extra:one_shot"] ?? 0) !== 8) throw new Error("Expected 8 one-shots");
  if ((s["extra:terrain"] ?? 0) !== 4) throw new Error("Expected 4 terrain");
}
console.log(JSON.stringify(result.case_summaries, null, 2));
console.log("Smoke test passed.");
