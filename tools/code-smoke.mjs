import fs from "node:fs";
import { caseCode, brickCode, packCode, parsePoolCode } from "../dist/codes.js";
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

const seed = "7M4Q2P8ABC";
const code = caseCode("HC", "TB", 1, 1, seed);

if (code !== "HC-TB-V1-G1-7M4Q2P8ABC") {
  throw new Error("Unexpected case code");
}

const parsed = parsePoolCode(packCode(code, 2, 7));

if (
  parsed.gameCode !== "HC" ||
  parsed.setCode !== "TB" ||
  parsed.brickIndex !== 2 ||
  parsed.packIndex !== 7 ||
  parsed.seed !== seed
) {
  throw new Error("Code parser failed");
}

const rngSeed = `heroclix|thunderbolts|V1|G1|${seed}`;

const a = generateCase(1, config, catalog, new SeededRandom(rngSeed));
const b = generateCase(1, config, catalog, new SeededRandom(rngSeed));

if (JSON.stringify(a) !== JSON.stringify(b)) {
  throw new Error("Identical seed did not reproduce identical case");
}

if (a.bricks.length !== 2) throw new Error("Expected exactly 2 bricks");

for (const brick of a.bricks) {
  if (brick.boosters.length !== 12) {
    throw new Error("Brick does not contain 12 boosters");
  }

  for (const booster of brick.boosters) {
    if (booster.cards.length !== 5) {
      throw new Error("Booster does not contain 5 game pieces");
    }
  }
}

console.log("Generic code/determinism smoke test passed.");
