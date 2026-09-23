import fs from "node:fs";
import { generateCase } from "../dist/engine.js";
import { SeededRandom } from "../dist/random.js";

const config = JSON.parse(fs.readFileSync(new URL("../test-data/games/heroclix/sets/thunderbolts/configs/v3.json", import.meta.url)));
const catalog = JSON.parse(fs.readFileSync(new URL("../test-data/games/heroclix/sets/thunderbolts/catalogs/v1.json", import.meta.url)));
let bricks = 0, d0 = 0, d1 = 0, d2 = 0, rarePrime = 0, srPrime = 0;
for (let n = 0; n < 100000; n++) {
  const generated = generateCase(1, config, catalog, new SeededRandom(`v3-dist-${n}`));
  for (const brick of generated.bricks) {
    bricks++;
    const counts = brick.boosters.map((b) => b.extras.length);
    const dead = counts.filter((x) => x === 0).length;
    const dbl = counts.filter((x) => x === 2).length;
    if (dead !== dbl || counts.some((x) => x < 0 || x > 2)) throw new Error(`Invalid balanced extras: ${counts}`);
    if (dead === 0) d0++; else if (dead === 1) d1++; else if (dead === 2) d2++; else throw new Error(`Unexpected displacement count ${dead}`);
    for (const booster of brick.boosters) for (const card of booster.cards) {
      if (!card.prime) continue;
      if (card.rarity === "Rare") rarePrime++;
      else if (card.rarity === "Super Rare") srPrime++;
    }
  }
}
const totalDisp = d0+d1+d2;
const primeTotal = rarePrime+srPrime;
console.log(JSON.stringify({bricks, displacement:{zero:d0,one:d1,two:d2, pct:[d0,d1,d2].map(x=>100*x/totalDisp)}, primes:{rare:rarePrime,super_rare:srPrime, rare_pct:100*rarePrime/primeTotal}}, null, 2));
