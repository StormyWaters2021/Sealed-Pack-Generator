import fs from "node:fs";

const source = fs.readFileSync(
  new URL("../src/index.ts", import.meta.url),
  "utf8",
);

for (const required of [
  "/api/games",
  "/api/generate",
  "/api/open",
  "/octgn/sets",
  "/octgn/generate",
  "/octgn/open",
  "application/json",
  "INVALID_CODE",
  "GAME_NOT_CONFIGURED",
]) {
  if (!source.includes(required)) {
    throw new Error(`Missing API surface marker: ${required}`);
  }
}

console.log("API surface smoke test passed.");
