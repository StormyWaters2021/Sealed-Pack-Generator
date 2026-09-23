import {
  Catalog,
  GameMetadata,
  Manifest,
  ManifestGame,
  ManifestSet,
  SetConfig,
} from "./types.js";

interface CacheEntry<T> {
  expires: number;
  value: T;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();

async function fetchJson<T>(
  url: string,
  ttlSeconds: number,
  bypassCache: boolean,
): Promise<T> {
  const now = Date.now();
  const existing = memoryCache.get(url);

  if (!bypassCache && existing && existing.expires > now) {
    return existing.value as T;
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Pack-Generator/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }

  const value = (await response.json()) as T;
  memoryCache.set(url, {
    expires: now + ttlSeconds * 1000,
    value,
  });
  return value;
}

function rootUrl(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

export async function loadManifest(
  dataBaseUrl: string,
  bypassCache = false,
): Promise<{ manifest: Manifest; manifestUrl: string }> {
  const manifestUrl = new URL("manifest.json", rootUrl(dataBaseUrl)).toString();
  const manifest = await fetchJson<Manifest>(manifestUrl, 300, bypassCache);
  return { manifest, manifestUrl };
}

export function findGameById(manifest: Manifest, gameId: string): ManifestGame {
  const found = manifest.games.find((g) => g.id === gameId);
  if (!found) throw new Error(`Unknown game '${gameId}'`);
  return found;
}

export function findGameByCode(manifest: Manifest, code: string): ManifestGame {
  const normalized = code.toUpperCase();
  const found = manifest.games.find((g) => g.code.toUpperCase() === normalized);
  if (!found) throw new Error(`Unknown game code '${code}'`);
  return found;
}

export function findSetById(game: ManifestGame, setId: string): ManifestSet {
  const found = game.sets.find((s) => s.id === setId);
  if (!found) throw new Error(`Unknown set '${setId}' for ${game.name}`);
  return found;
}

export function findSetByCode(game: ManifestGame, code: string): ManifestSet {
  const normalized = code.toUpperCase();
  const found = game.sets.find((s) => s.code.toUpperCase() === normalized);
  if (!found) throw new Error(`Unknown set code '${code}' for ${game.name}`);
  return found;
}

export async function loadGameMetadata(
  game: ManifestGame,
  dataBaseUrl: string,
  bypassCache = false,
): Promise<GameMetadata> {
  const url = new URL(game.metadata_path, rootUrl(dataBaseUrl)).toString();
  return await fetchJson<GameMetadata>(url, 300, bypassCache);
}

function configPathForVersion(setInfo: ManifestSet, version: number): string {
  const current = setInfo.config_path;

  if (version === setInfo.current_config_version) return current;

  const replaced = current.replace(/\/v\d+\.json$/i, `/v${version}.json`);
  if (replaced === current) {
    throw new Error(
      `Cannot derive config V${version} from manifest path '${current}'.`,
    );
  }
  return replaced;
}

export async function loadSetVersion(
  game: ManifestGame,
  setInfo: ManifestSet,
  configVersion: number,
  dataBaseUrl: string,
  bypassCache = false,
): Promise<{
  config: SetConfig;
  catalog: Catalog;
  configUrl: string;
  catalogUrl: string;
}> {
  const configPath = configPathForVersion(setInfo, configVersion);
  const configUrl = new URL(configPath, rootUrl(dataBaseUrl)).toString();
  const config = await fetchJson<SetConfig>(configUrl, 300, bypassCache);

  if (config.game_id !== game.id) {
    throw new Error(
      `Config game_id '${config.game_id}' does not match '${game.id}'.`,
    );
  }

  if (config.set_id !== setInfo.id) {
    throw new Error(
      `Config set_id '${config.set_id}' does not match '${setInfo.id}'.`,
    );
  }

  if (config.config_version !== configVersion) {
    throw new Error(
      `Config version mismatch: expected V${configVersion}, got V${config.config_version}.`,
    );
  }

  const catalogUrl = new URL(config.catalog_url, configUrl).toString();
  const catalog = await fetchJson<Catalog>(
    catalogUrl,
    config.cache_seconds ?? 300,
    bypassCache,
  );

  if (catalog.game_id && catalog.game_id !== game.id) {
    throw new Error(
      `Catalog game_id '${catalog.game_id}' does not match '${game.id}'.`,
    );
  }

  if (catalog.set_id !== setInfo.id) {
    throw new Error(
      `Catalog set_id '${catalog.set_id}' does not match '${setInfo.id}'.`,
    );
  }

  return { config, catalog, configUrl, catalogUrl };
}
