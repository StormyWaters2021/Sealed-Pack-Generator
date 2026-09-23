import { ParsedPoolCode } from "./types.js";

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const SEED_LENGTH = 10;

export function randomSeed(): string {
  // Rejection sampling avoids modulo bias because 256 is not divisible by the
  // 31-character seed alphabet. This affects only newly issued random codes;
  // deterministic generation from an existing code is unchanged.
  const unbiasedLimit = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  let out = "";
  while (out.length < SEED_LENGTH) {
    const bytes = new Uint8Array(SEED_LENGTH - out.length + 2);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= unbiasedLimit) continue;
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === SEED_LENGTH) break;
    }
  }
  return out;
}

export function caseCode(
  gameCode: string,
  setCode: string,
  configVersion: number,
  engineVersion: number,
  seed: string,
): string {
  return [
    gameCode.toUpperCase(),
    setCode.toUpperCase(),
    `V${configVersion}`,
    `G${engineVersion}`,
    seed.toUpperCase(),
  ].join("-");
}

export function brickCode(caseCodeValue: string, brickIndex: number): string {
  return `${caseCodeValue}-B${brickIndex}`;
}

export function packCode(
  caseCodeValue: string,
  brickIndex: number,
  packIndex: number,
): string {
  return `${caseCodeValue}-B${brickIndex}-P${String(packIndex).padStart(2, "0")}`;
}

export function parsePoolCode(input: string): ParsedPoolCode {
  const raw = input.trim().toUpperCase();

  const match = raw.match(
    /^([A-Z0-9]+)-([A-Z0-9]+)-V(\d+)-G(\d+)-([23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6,32})(?:-B(\d+))?(?:-P(\d+))?$/,
  );

  if (!match) {
    throw new Error(
      "Invalid pool code. Expected GAME-SET-V#-G#-SEED, optionally followed by -B# and -P##.",
    );
  }

  const brickIndex = match[6] ? Number(match[6]) : undefined;
  const packIndex = match[7] ? Number(match[7]) : undefined;

  if (packIndex !== undefined && brickIndex === undefined) {
    throw new Error("Pack codes must include a brick number.");
  }

  return {
    raw,
    gameCode: match[1],
    setCode: match[2],
    configVersion: Number(match[3]),
    engineVersion: Number(match[4]),
    seed: match[5],
    brickIndex,
    packIndex,
  };
}
