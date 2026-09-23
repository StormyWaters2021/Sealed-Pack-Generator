export type UniqueScope = "none" | "brick" | "case";

export interface CatalogCard {
  model_id: string;
  name: string;
  collector_number: string;
  unit_type: string;
  rarity: string;
  prime: boolean;
  properties?: string;
}

export interface Catalog {
  schema_version: number;
  catalog_version?: number;
  game_id?: string;
  set_id: string;
  set_name: string;
  cards: CatalogCard[];
}

export interface WeightedCount {
  value: number;
  weight: number;
}

export interface PoolSelector {
  any_of?: PoolSelector[];
  unit_types?: string[];
  rarities?: string[];
  prime?: boolean;
  collector_numbers?: string[];
  collector_regex?: string;
  exclude_collector_numbers?: string[];
  model_ids?: string[];
  exclude_model_ids?: string[];
}

export interface BaseProfile {
  count: number;
  slots: string[];
}

export interface SubstitutionRule {
  id: string;
  from_category: string;
  to_category: string;
  pool: string;
  count?: number;
  count_distribution?: WeightedCount[];
}

export interface PrimeRule {
  pool: string;
  count_distribution: WeightedCount[];
  printed_rarity_distribution?: Array<{ rarity: string; weight: number }>;
  target_categories_by_printed_rarity: Record<string, string[]>;
}

export interface ExtraGroup {
  pool: string;
  count: number;
  category: string;
}

export interface BrickTopperGroup {
  pool: string;
  count: number;
  category: string;
}

export interface SetConfig {
  schema_version: number;
  config_version: number;
  engine_version: number;
  game_id: string;
  set_id: string;
  name: string;
  catalog_url: string;
  cache_seconds?: number;
  case: {
    bricks_per_case: number;
  };
  brick: {
    boosters_per_brick: number;
    base_profiles: BaseProfile[];
    substitutions: SubstitutionRule[];
    toppers?: { groups: BrickTopperGroup[] };
    prime?: PrimeRule;
    extras?: {
      assignment?: "one_per_booster" | "random" | "random_bounded" | "balanced_displacement";
      max_per_booster?: number;
      displacement_distribution?: WeightedCount[];
      groups: ExtraGroup[];
    };
  };
  pools: Record<string, PoolSelector>;
  pool_policies?: Record<string, { unique_scope?: UniqueScope }>;
}

export interface GeneratedCard extends CatalogCard {
  category: string;
  pool: string;
}

export interface BoosterResult {
  booster_index: number;
  profile: string[];
  cards: GeneratedCard[];
  extras: GeneratedCard[];
}

export interface BrickResult {
  brick_index: number;
  toppers?: GeneratedCard[];
  boosters: BoosterResult[];
  summary: Record<string, number>;
}

export interface CaseResult {
  case_index: number;
  bricks: BrickResult[];
}

export interface ManifestSet {
  id: string;
  code: string;
  name: string;
  current_config_version: number;
  engine_version: number;
  config_path: string;
}

export interface ManifestGame {
  id: string;
  code: string;
  name: string;
  metadata_path: string;
  sets: ManifestSet[];
}

export interface Manifest {
  schema_version: number;
  games: ManifestGame[];
}

export interface GameMetadata {
  schema_version: number;
  id: string;
  code: string;
  name: string;
  integrations?: {
    octgn?: {
      game_id: string;
      default_section: string;
    };
  };
}


export interface GenerateRequest {
  set: string;
  request: {
    kind: "packs" | "bricks" | "cases";
    count: number;
  };
  seed?: string;
  debug?: boolean;
}

export type OpenKind = "case" | "brick" | "pack";

export interface ParsedPoolCode {
  raw: string;
  gameCode: string;
  setCode: string;
  configVersion: number;
  engineVersion: number;
  seed: string;
  brickIndex?: number;
  packIndex?: number;
}

export interface OpenedPool {
  kind: OpenKind;
  code: string;
  case_code: string;
  brick_code?: string;
  pack_code?: string;
  game: ManifestGame;
  set: ManifestSet;
  config: {
    version: number;
    engine_version: number;
  };
  seed: string;
  selected: CaseResult | BrickResult | BoosterResult;
  generated_case: CaseResult;
  integrations?: GameMetadata["integrations"];
}
