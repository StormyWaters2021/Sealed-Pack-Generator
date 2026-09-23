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
  GameMetadata,
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

class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
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

function apiOk<T>(data: T, status = 200): Response {
  return json({ ok: true, data }, status);
}

function apiError(error: ApiError): Response {
  return json(
    {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
      },
    },
    error.status,
  );
}

function textResponse(body: string, status = 200): Response {
  return new Response(body.endsWith("\n") ? body : `${body}\n`, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function sanitizeField(value: unknown): string {
  return String(value ?? "").replace(/[\t\r\n]+/g, " ").trim();
}

function octgnOk(lines: string[]): Response {
  return textResponse(["OK", ...lines].join("\n"), 200);
}

function octgnError(code: string, message: string): Response {
  return textResponse(
    [
      "ERROR",
      `CODE\t${sanitizeField(code)}`,
      `MESSAGE\t${sanitizeField(message)}`,
    ].join("\n"),
    200,
  );
}

function normalizeProduct(value: string): "case" | "brick" | "pack" {
  const normalized = value.trim().toLowerCase();

  if (normalized === "case") return "case";
  if (normalized === "box" || normalized === "brick") return "brick";
  if (normalized === "pack" || normalized === "booster") return "pack";

  throw new ApiError(
    "INVALID_PRODUCT_TYPE",
    "Product must be case, box/brick, or pack.",
    400,
  );
}

function rngSeed(
  game: ManifestGame,
  setInfo: ManifestSet,
  configVersion: number,
  engineVersion: number,
  seed: string,
): string {
  return [game.id, setInfo.id, `V${configVersion}`, `G${engineVersion}`, seed].join("|");
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
  if (!brick) {
    throw new ApiError(
      "INVALID_BOX_INDEX",
      `Box/brick ${brickIndex} does not exist in this case.`,
      400,
    );
  }

  if (packIndex === undefined) {
    return { kind: "brick", selected: brick };
  }

  const pack = brick.boosters[packIndex - 1];
  if (!pack) {
    throw new ApiError(
      "INVALID_PACK_INDEX",
      `Pack ${packIndex} does not exist in box/brick ${brickIndex}.`,
      400,
    );
  }

  return { kind: "pack", selected: pack };
}

function translateConfigError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);

  if (/Unknown game '/i.test(message)) {
    throw new ApiError("GAME_NOT_CONFIGURED", message, 404);
  }
  if (/Unknown game code/i.test(message)) {
    throw new ApiError("UNKNOWN_GAME_CODE", message, 404);
  }
  if (/Unknown set '/i.test(message)) {
    throw new ApiError("SET_NOT_CONFIGURED", message, 404);
  }
  if (/Unknown set code/i.test(message)) {
    throw new ApiError("UNKNOWN_SET_CODE", message, 404);
  }
  if (/Failed to fetch .*\/v\d+\.json/i.test(message)) {
    throw new ApiError("CONFIG_VERSION_NOT_FOUND", message, 404);
  }
  if (/Failed to fetch/i.test(message)) {
    throw new ApiError("CONFIG_LOAD_FAILED", message, 502);
  }
  if (/Generator G\d+ is not supported/i.test(message)) {
    throw new ApiError("ENGINE_VERSION_NOT_SUPPORTED", message, 400);
  }

  throw new ApiError("GENERATION_FAILED", message, 500);
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
  if (engineVersion !== 1 && engineVersion !== 2 && engineVersion !== 3) {
    throw new ApiError(
      "ENGINE_VERSION_NOT_SUPPORTED",
      `Generator G${engineVersion} is not supported by this deployment.`,
      400,
    );
  }

  try {
    const [loaded, gameMetadata] = await Promise.all([
      loadSetVersion(game, setInfo, configVersion, env.DATA_BASE_URL, bypassCache),
      loadGameMetadata(game, env.DATA_BASE_URL, bypassCache),
    ]);

    if (loaded.config.engine_version !== engineVersion) {
      throw new ApiError(
        "ENGINE_VERSION_NOT_SUPPORTED",
        `Code requests G${engineVersion}, but config V${configVersion} expects G${loaded.config.engine_version}.`,
        400,
      );
    }

    const seedText = rngSeed(game, setInfo, configVersion, engineVersion, seed);

    const generatedCase = generateCase(
      1,
      loaded.config,
      loaded.catalog,
      new SeededRandom(seedText),
    );

    return {
      generatedCase,
      gameMetadata,
      seedText,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    translateConfigError(error);
  }
}

function makeOpenedPool(
  game: ManifestGame,
  setInfo: ManifestSet,
  configVersion: number,
  engineVersion: number,
  seed: string,
  kind: "case" | "brick" | "pack",
  generatedCase: CaseResult,
  selected: CaseResult | BrickResult | BoosterResult,
  integrations: GameMetadata["integrations"] | undefined,
  brickIndex?: number,
  packIndex?: number,
): OpenedPool {
  const cCode = caseCode(game.code, setInfo.code, configVersion, engineVersion, seed);

  return {
    kind,
    code:
      kind === "case"
        ? cCode
        : kind === "brick"
          ? brickCode(cCode, brickIndex!)
          : packCode(cCode, brickIndex!, packIndex!),
    case_code: cCode,
    brick_code:
      brickIndex !== undefined
        ? brickCode(cCode, brickIndex)
        : undefined,
    pack_code:
      packIndex !== undefined
        ? packCode(cCode, brickIndex!, packIndex)
        : undefined,
    game,
    set: setInfo,
    config: {
      version: configVersion,
      engine_version: engineVersion,
    },
    seed,
    selected,
    generated_case: generatedCase,
    integrations,
  };
}

async function generateProduct(
  env: Env,
  gameId: string,
  setId: string,
  product: string,
  seedInput: string | undefined,
  bypassCache: boolean,
): Promise<OpenedPool> {
  try {
    const { manifest } = await loadManifest(env.DATA_BASE_URL, bypassCache);
    const game = findGameById(manifest, gameId);
    const setInfo = findSetById(game, setId);
    const kind = normalizeProduct(product);

    const configVersion = setInfo.current_config_version;
    const engineVersion = setInfo.engine_version;
    const seed = seedInput?.trim().toUpperCase() || randomSeed();

    const generated = await generateFromSeed(
      env,
      game,
      setInfo,
      configVersion,
      engineVersion,
      seed,
      bypassCache,
    );

    const selectedInfo = selectKind(
      generated.generatedCase,
      kind,
      generated.seedText,
    );

    return makeOpenedPool(
      game,
      setInfo,
      configVersion,
      engineVersion,
      seed,
      kind,
      generated.generatedCase,
      selectedInfo.selected,
      generated.gameMetadata.integrations,
      selectedInfo.brickIndex,
      selectedInfo.packIndex,
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    translateConfigError(error);
  }
}

async function openProduct(
  env: Env,
  codeValue: string,
  bypassCache: boolean,
): Promise<OpenedPool> {
  let parsed;
  try {
    parsed = parsePoolCode(codeValue);
  } catch (error) {
    throw new ApiError(
      "INVALID_CODE",
      error instanceof Error ? error.message : "Invalid sealed product code.",
      400,
    );
  }

  try {
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

    return makeOpenedPool(
      game,
      setInfo,
      parsed.configVersion,
      parsed.engineVersion,
      parsed.seed,
      selection.kind,
      generated.generatedCase,
      selection.selected,
      generated.gameMetadata.integrations,
      parsed.brickIndex,
      parsed.packIndex,
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    translateConfigError(error);
  }
}

function publicGamesPayload(manifest: { games: ManifestGame[] }) {
  return {
    games: manifest.games.map((game) => ({
      id: game.id,
      code: game.code,
      name: game.name,
      sets: game.sets.map((setInfo) => ({
        id: setInfo.id,
        code: setInfo.code,
        name: setInfo.name,
        current_config_version: setInfo.current_config_version,
        engine_version: setInfo.engine_version,
        products: {
          case: "Case",
          box: game.id === "heroclix" ? "Brick" : "Box",
          pack: "Pack",
        },
      })),
    })),
  };
}

async function parseJsonGenerateRequest(request: Request): Promise<{
  game: string;
  set: string;
  product: string;
  seed?: string;
}> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new ApiError(
      "UNSUPPORTED_MEDIA_TYPE",
      "Public API generation requests must use Content-Type: application/json.",
      415,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(
      "INVALID_REQUEST_BODY",
      "Request body is not valid JSON.",
      400,
    );
  }

  if (!body || typeof body !== "object") {
    throw new ApiError(
      "INVALID_REQUEST_BODY",
      "Request body must be a JSON object.",
      400,
    );
  }

  const value = body as Record<string, unknown>;
  const game = String(value.game ?? "").trim();
  const set = String(value.set ?? "").trim();
  const product = String(value.product ?? value.kind ?? "").trim();
  const seed = value.seed === undefined ? undefined : String(value.seed).trim();

  if (!game) throw new ApiError("MISSING_GAME", "'game' is required.", 400);
  if (!set) throw new ApiError("MISSING_SET", "'set' is required.", 400);
  if (!product) throw new ApiError("MISSING_PRODUCT", "'product' is required.", 400);

  return { game, set, product, seed };
}

function selectedCards(opened: OpenedPool) {
  if (opened.kind === "pack") {
    const pack = opened.selected as BoosterResult;
    return [...pack.cards, ...(pack.extras || [])];
  }

  if (opened.kind === "brick") {
    const brick = opened.selected as BrickResult;
    return [
      ...(brick.toppers || []),
      ...brick.boosters.flatMap((pack) => [
        ...pack.cards,
        ...(pack.extras || []),
      ]),
    ];
  }

  const generatedCase = opened.selected as CaseResult;
  return generatedCase.bricks.flatMap((brick) => [
    ...(brick.toppers || []),
    ...brick.boosters.flatMap((pack) => [
      ...pack.cards,
      ...(pack.extras || []),
    ]),
  ]);
}

function flattenModels(
  opened: OpenedPool,
): Array<{ model_id: string; qty: number }> {
  const counts = new Map<string, number>();

  for (const card of selectedCards(opened)) {
    counts.set(card.model_id, (counts.get(card.model_id) ?? 0) + 1);
  }

  return [...counts.entries()].map(([model_id, qty]) => ({
    model_id,
    qty,
  }));
}

async function resolveGameByOctgnId(
  env: Env,
  octgnGameId: string,
  bypassCache: boolean,
): Promise<ManifestGame> {
  const { manifest } = await loadManifest(env.DATA_BASE_URL, bypassCache);

  for (const game of manifest.games) {
    try {
      const metadata = await loadGameMetadata(
        game,
        env.DATA_BASE_URL,
        bypassCache,
      );

      if (metadata.integrations?.octgn?.game_id === octgnGameId) {
        return game;
      }
    } catch {
      // Ignore unrelated broken game metadata during discovery.
    }
  }

  throw new ApiError(
    "GAME_NOT_CONFIGURED",
    "No sealed-product configuration was found for this OCTGN game.",
    404,
  );
}

async function handlePublicApi(
  request: Request,
  env: Env,
  url: URL,
  bypassCache: boolean,
): Promise<Response> {
  if (url.pathname === "/api/health" && request.method === "GET") {
    return apiOk({
      service: "pack-generator",
      engine_version: 1,
    });
  }

  if (
    (url.pathname === "/api/games" || url.pathname === "/api/sets") &&
    request.method === "GET"
  ) {
    const loaded = await loadManifest(env.DATA_BASE_URL, bypassCache);
    return apiOk(publicGamesPayload(loaded.manifest));
  }

  if (url.pathname === "/api/generate" && request.method === "POST") {
    const body = await parseJsonGenerateRequest(request);
    const opened = await generateProduct(
      env,
      body.game,
      body.set,
      body.product,
      body.seed,
      bypassCache,
    );
    return apiOk(opened);
  }

  if (url.pathname === "/api/open" && request.method === "GET") {
    const codeValue = url.searchParams.get("code");

    if (!codeValue) {
      throw new ApiError(
        "MISSING_CODE",
        "'code' query parameter is required.",
        400,
      );
    }

    const opened = await openProduct(env, codeValue, bypassCache);
    return apiOk(opened);
  }

  throw new ApiError("NOT_FOUND", "API endpoint not found.", 404);
}

async function handleOctgnApi(
  request: Request,
  env: Env,
  url: URL,
  bypassCache: boolean,
): Promise<Response> {
  try {
    if (url.pathname === "/octgn/sets" && request.method === "GET") {
      const gameId = url.searchParams.get("gameid")?.trim();

      if (!gameId) {
        return octgnError("MISSING_GAME_ID", "gameid is required.");
      }

      const game = await resolveGameByOctgnId(
        env,
        gameId,
        bypassCache,
      );

      return octgnOk([
        `GAME\t${sanitizeField(game.name)}`,
        ...game.sets.map((setInfo) =>
          [
            "SET",
            sanitizeField(setInfo.id),
            sanitizeField(setInfo.code),
            sanitizeField(setInfo.name),
          ].join("\t"),
        ),
      ]);
    }

    if (url.pathname === "/octgn/generate" && request.method === "GET") {
      const octgnGameId = url.searchParams.get("gameid")?.trim() ?? "";
      const setId = url.searchParams.get("set")?.trim() ?? "";
      const product = url.searchParams.get("product")?.trim() ?? "";
      const seed = url.searchParams.get("seed")?.trim() || undefined;

      if (!octgnGameId) {
        return octgnError("MISSING_GAME_ID", "gameid is required.");
      }
      if (!setId) {
        return octgnError("MISSING_SET", "set is required.");
      }
      if (!product) {
        return octgnError("MISSING_PRODUCT", "product is required.");
      }

      const game = await resolveGameByOctgnId(
        env,
        octgnGameId,
        bypassCache,
      );

      const opened = await generateProduct(
        env,
        game.id,
        setId,
        product,
        seed,
        bypassCache,
      );

      return octgnOk([
        `CODE\t${sanitizeField(opened.code)}`,
        `PRODUCT\t${sanitizeField(
          opened.kind === "brick" ? "box" : opened.kind,
        )}`,
        `DISPLAY\t${sanitizeField(
          opened.kind === "brick"
            ? "Brick"
            : opened.kind[0].toUpperCase() + opened.kind.slice(1),
        )}`,
        ...flattenModels(opened).map(
          (item) =>
            `MODEL\t${sanitizeField(item.model_id)}\t${item.qty}`,
        ),
      ]);
    }

    if (url.pathname === "/octgn/open" && request.method === "GET") {
      const codeValue = url.searchParams.get("code")?.trim();

      if (!codeValue) {
        return octgnError("MISSING_CODE", "code is required.");
      }

      const opened = await openProduct(
        env,
        codeValue,
        bypassCache,
      );

      return octgnOk([
        `CODE\t${sanitizeField(opened.code)}`,
        `PRODUCT\t${sanitizeField(
          opened.kind === "brick" ? "box" : opened.kind,
        )}`,
        `DISPLAY\t${sanitizeField(
          opened.kind === "brick"
            ? "Brick"
            : opened.kind[0].toUpperCase() + opened.kind.slice(1),
        )}`,
        ...flattenModels(opened).map(
          (item) =>
            `MODEL\t${sanitizeField(item.model_id)}\t${item.qty}`,
        ),
      ]);
    }

    return octgnError("NOT_FOUND", "OCTGN endpoint not found.");
  } catch (error) {
    if (error instanceof ApiError) {
      return octgnError(error.code, error.message);
    }

    const message =
      error instanceof Error ? error.message : String(error);

    return octgnError("INTERNAL_ERROR", message);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const bypassCache = url.searchParams.get("refresh") === "1";

    try {
      if (!env.DATA_BASE_URL) {
        throw new ApiError(
          "CONFIG_LOAD_FAILED",
          "DATA_BASE_URL is not configured.",
          500,
        );
      }

      if (url.pathname.startsWith("/octgn/")) {
        return await handleOctgnApi(
          request,
          env,
          url,
          bypassCache,
        );
      }

      if (url.pathname.startsWith("/api/")) {
        return await handlePublicApi(
          request,
          env,
          url,
          bypassCache,
        );
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof ApiError) {
        return apiError(error);
      }

      const message =
        error instanceof Error ? error.message : String(error);

      return apiError(
        new ApiError("INTERNAL_ERROR", message, 500),
      );
    }
  },
};
