import {
  findGameByCode,
  findGameById,
  findSetByCode,
  findSetById,
  loadGameMetadata,
  loadManifest,
  loadSetVersion,
} from "./config.js";
import { brickCode, caseCode, packCode, parsePoolCode, randomSeed } from "./codes.js";
import { generateCase } from "./engine.js";
import { SeededRandom } from "./random.js";
import {
  BoosterResult,
  BrickResult,
  CaseResult,
  ManifestGame,
  ManifestSet,
  OpenedPool,
} from "./types.js";

interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  DATA_BASE_URL: string;
  ASSETS: AssetBinding;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function rngSeed(
  game: ManifestGame,
  setInfo: ManifestSet,
  configVersion: number,
  engineVersion: number,
  seed: string,
): string {
  return [
    game.id,
    setInfo.id,
    `V${configVersion}`,
    `G${engineVersion}`,
    seed,
  ].join("|");
}

function selectionRng(seedText: string): SeededRandom {
  return new SeededRandom(`${seedText}|selection`);
}

function selectKind(
  generatedCase: CaseResult,
  kind: "case" | "brick" | "pack",
  seedText: string,
): {
  selected: CaseResult | BrickResult | BoosterResult;
  brickIndex?: number;
  packIndex?: number;
} {
  if (kind === "case") {
    return { selected: generatedCase };
  }

  const rng = selectionRng(seedText);
  const brickIndex = rng.int(generatedCase.bricks.length) + 1;
  const brick = generatedCase.bricks[brickIndex - 1];

  if (kind === "brick") {
    return { selected: brick, brickIndex };
  }

  const packIndex = rng.int(brick.boosters.length) + 1;
  return {
    selected: brick.boosters[packIndex - 1],
    brickIndex,
    packIndex,
  };
}

function openExistingSelection(
  generatedCase: CaseResult,
  brickIndex?: number,
  packIndex?: number,
): {
  kind: "case" | "brick" | "pack";
  selected: CaseResult | BrickResult | BoosterResult;
} {
  if (brickIndex === undefined) {
    return { kind: "case", selected: generatedCase };
  }

  const brick = generatedCase.bricks[brickIndex - 1];
  if (!brick) throw new Error(`Brick ${brickIndex} does not exist in this case.`);

  if (packIndex === undefined) {
    return { kind: "brick", selected: brick };
  }

  const pack = brick.boosters[packIndex - 1];
  if (!pack) {
    throw new Error(`Pack ${packIndex} does not exist in brick ${brickIndex}.`);
  }

  return { kind: "pack", selected: pack };
}

async function generateFromSeed(
  env: Env,
  game: ManifestGame,
  setInfo: ManifestSet,
  configVersion: number,
  engineVersion: number,
  seed: string,
  bypassCache: boolean,
) {
  if (engineVersion !== 1) {
    throw new Error(`Generator G${engineVersion} is not supported by this deployment.`);
  }

  const [loaded, gameMetadata] = await Promise.all([
    loadSetVersion(game, setInfo, configVersion, env.DATA_BASE_URL, bypassCache),
    loadGameMetadata(game, env.DATA_BASE_URL, bypassCache),
  ]);

  if (loaded.config.engine_version !== engineVersion) {
    throw new Error(
      `Code requests G${engineVersion}, but config V${configVersion} expects G${loaded.config.engine_version}.`,
    );
  }

  const seedText = rngSeed(
    game,
    setInfo,
    configVersion,
    engineVersion,
    seed,
  );

  const generatedCase = generateCase(
    1,
    loaded.config,
    loaded.catalog,
    new SeededRandom(seedText),
  );

  return {
    generatedCase,
    loaded,
    gameMetadata,
    seedText,
  };
}

async function handleGenerate(
  request: Request,
  env: Env,
  bypassCache: boolean,
): Promise<Response> {
  const body = (await request.json()) as {
    game?: string;
    set?: string;
    kind?: "pack" | "brick" | "case";
    seed?: string;
  };

  if (!body.game) throw new Error("'game' is required.");
  if (!body.set) throw new Error("'set' is required.");

  if (!body.kind || !["pack", "brick", "case"].includes(body.kind)) {
    throw new Error("'kind' must be pack, brick, or case.");
  }

  const { manifest } = await loadManifest(env.DATA_BASE_URL, bypassCache);
  const game = findGameById(manifest, body.game);
  const setInfo = findSetById(game, body.set);

  const configVersion = setInfo.current_config_version;
  const engineVersion = setInfo.engine_version;
  const seed = body.seed?.trim().toUpperCase() || randomSeed();

  const generated = await generateFromSeed(
    env,
    game,
    setInfo,
    configVersion,
    engineVersion,
    seed,
    bypassCache,
  );

  const cCode = caseCode(
    game.code,
    setInfo.code,
    configVersion,
    engineVersion,
    seed,
  );

  const selectedInfo = selectKind(
    generated.generatedCase,
    body.kind,
    generated.seedText,
  );

  const opened: OpenedPool = {
    kind: body.kind,
    code:
      body.kind === "case"
        ? cCode
        : body.kind === "brick"
          ? brickCode(cCode, selectedInfo.brickIndex!)
          : packCode(cCode, selectedInfo.brickIndex!, selectedInfo.packIndex!),
    case_code: cCode,
    brick_code:
      selectedInfo.brickIndex !== undefined
        ? brickCode(cCode, selectedInfo.brickIndex)
        : undefined,
    pack_code:
      selectedInfo.packIndex !== undefined
        ? packCode(cCode, selectedInfo.brickIndex!, selectedInfo.packIndex)
        : undefined,
    game,
    set: setInfo,
    config: {
      version: configVersion,
      engine_version: engineVersion,
    },
    seed,
    selected: selectedInfo.selected,
    generated_case: generated.generatedCase,
    integrations: generated.gameMetadata.integrations,
  };

  return json(opened);
}

async function handleOpen(
  url: URL,
  env: Env,
  bypassCache: boolean,
): Promise<Response> {
  const codeValue = url.searchParams.get("code");
  if (!codeValue) throw new Error("'code' query parameter is required.");

  const parsed = parsePoolCode(codeValue);
  const { manifest } = await loadManifest(env.DATA_BASE_URL, bypassCache);

  const game = findGameByCode(manifest, parsed.gameCode);
  const setInfo = findSetByCode(game, parsed.setCode);

  const generated = await generateFromSeed(
    env,
    game,
    setInfo,
    parsed.configVersion,
    parsed.engineVersion,
    parsed.seed,
    bypassCache,
  );

  const selection = openExistingSelection(
    generated.generatedCase,
    parsed.brickIndex,
    parsed.packIndex,
  );

  const cCode = caseCode(
    game.code,
    setInfo.code,
    parsed.configVersion,
    parsed.engineVersion,
    parsed.seed,
  );

  const opened: OpenedPool = {
    kind: selection.kind,
    code: parsed.raw,
    case_code: cCode,
    brick_code:
      parsed.brickIndex !== undefined
        ? brickCode(cCode, parsed.brickIndex)
        : undefined,
    pack_code:
      parsed.packIndex !== undefined
        ? packCode(cCode, parsed.brickIndex!, parsed.packIndex)
        : undefined,
    game,
    set: setInfo,
    config: {
      version: parsed.configVersion,
      engine_version: parsed.engineVersion,
    },
    seed: parsed.seed,
    selected: selection.selected,
    generated_case: generated.generatedCase,
    integrations: generated.gameMetadata.integrations,
  };

  return json(opened);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const bypassCache = url.searchParams.get("refresh") === "1";

    try {
      if (!env.DATA_BASE_URL) {
        throw new Error("DATA_BASE_URL is not configured.");
      }

      if (url.pathname === "/api/health") {
        return json({
          ok: true,
          service: "pack-generator",
          engine_version: 1,
          data_base_url: env.DATA_BASE_URL,
        });
      }

      if (url.pathname === "/api/sets" && request.method === "GET") {
        const loaded = await loadManifest(env.DATA_BASE_URL, bypassCache);
        return json(loaded.manifest);
      }

      if (url.pathname === "/api/generate" && request.method === "POST") {
        return await handleGenerate(request, env, bypassCache);
      }

      if (url.pathname === "/api/open" && request.method === "GET") {
        return await handleOpen(url, env, bypassCache);
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (url.pathname.startsWith("/api/")) {
        return json({ error: message }, 400);
      }

      return new Response(message, { status: 500 });
    }
  },
};
