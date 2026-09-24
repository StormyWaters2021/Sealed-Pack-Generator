import {
  BaseProfile, BoosterResult, BrickResult, CaseResult, Catalog, CatalogCard,
  GeneratedCard, GenerateRequest, PoolSelector, SetConfig, UniqueScope
} from "./types.js";
import { RandomSource, weightedValue } from "./random.js";

interface Slot { category: string; pool: string; }
interface GenerationState { caseUsed: Set<string>; brickUsed: Set<string>; }

function matchesSelector(card: CatalogCard, selector: PoolSelector): boolean {
  if (selector.any_of?.length) return selector.any_of.some((s) => matchesSelector(card, s));
  if (selector.unit_types && !selector.unit_types.includes(card.unit_type)) return false;
  if (selector.rarities && !selector.rarities.includes(card.rarity)) return false;
  if (typeof selector.prime === "boolean" && card.prime !== selector.prime) return false;
  if (selector.collector_numbers && !selector.collector_numbers.includes(card.collector_number)) return false;
  if (selector.collector_regex && !(new RegExp(selector.collector_regex).test(card.collector_number))) return false;
  if (selector.exclude_collector_numbers?.includes(card.collector_number)) return false;
  if (selector.model_ids && !selector.model_ids.includes(card.model_id)) return false;
  if (selector.exclude_model_ids?.includes(card.model_id)) return false;
  return true;
}

export function buildPools(config: SetConfig, catalog: Catalog): Record<string, CatalogCard[]> {
  const pools: Record<string, CatalogCard[]> = {};
  for (const [name, selector] of Object.entries(config.pools)) {
    pools[name] = catalog.cards.filter((card) => matchesSelector(card, selector));
    if (!pools[name].length) throw new Error(`Pool '${name}' resolved to zero cards`);
  }
  return pools;
}

function uniqueScopeFor(config: SetConfig, pool: string): UniqueScope {
  return config.pool_policies?.[pool]?.unique_scope ?? "none";
}

function drawCard(
  poolName: string, category: string, pools: Record<string, CatalogCard[]>,
  config: SetConfig, state: GenerationState, rng: RandomSource, boosterUsed?: Set<string>
): GeneratedCard {
  const pool = pools[poolName];
  if (!pool?.length) throw new Error(`Missing or empty pool '${poolName}'`);

  const scope = uniqueScopeFor(config, poolName);
  let eligible = pool;
  if (scope === "brick") eligible = eligible.filter((c) => !state.brickUsed.has(c.model_id));
  if (scope === "case") eligible = eligible.filter((c) => !state.caseUsed.has(c.model_id));
  if (boosterUsed) eligible = eligible.filter((c) => !boosterUsed.has(c.model_id));
  if (!eligible.length) {
    const detail = boosterUsed ? `${scope} + booster` : scope;
    throw new Error(`Pool '${poolName}' exhausted under ${detail} uniqueness`);
  }

  const card = eligible[rng.int(eligible.length)];
  if (scope === "brick") state.brickUsed.add(card.model_id);
  if (scope === "case") state.caseUsed.add(card.model_id);
  if (boosterUsed) boosterUsed.add(card.model_id);
  return { ...card, category, pool: poolName };
}

function expandProfiles(profiles: BaseProfile[], expectedBoosters: number): string[][] {
  const out: string[][] = [];
  for (const profile of profiles) {
    for (let i = 0; i < profile.count; i++) out.push(profile.slots.slice());
  }
  if (out.length !== expectedBoosters) {
    throw new Error(`Base profiles create ${out.length} boosters, expected ${expectedBoosters}`);
  }
  return out;
}

function candidateSlots(boosters: Slot[][], category: string) {
  const out: Array<{ booster: number; slot: number }> = [];
  for (let b = 0; b < boosters.length; b++) {
    for (let s = 0; s < boosters[b].length; s++) {
      if (boosters[b][s].category === category) out.push({ booster: b, slot: s });
    }
  }
  return out;
}

function applySubstitutions(boosters: Slot[][], config: SetConfig, rng: RandomSource): void {
  for (const rule of config.brick.substitutions) {
    const count = rule.count ?? weightedValue(rule.count_distribution ?? [], rng);
    if (count === 0) continue;
    const candidates = rng.shuffle(candidateSlots(boosters, rule.from_category));
    if (candidates.length < count) {
      throw new Error(`Substitution '${rule.id}' needs ${count} '${rule.from_category}' slots but only ${candidates.length} remain`);
    }
    for (let i = 0; i < count; i++) {
      const c = candidates[i];
      boosters[c.booster][c.slot] = { category: rule.to_category, pool: rule.pool };
    }
  }
}

function applyPrimes(
  boosters: Slot[][], config: SetConfig, pools: Record<string, CatalogCard[]>,
  state: GenerationState, rng: RandomSource
): Map<string, CatalogCard> {
  const replacements = new Map<string, CatalogCard>();
  const rule = config.brick.prime;
  if (!rule) return replacements;

  const count = weightedValue(rule.count_distribution, rng);
  for (let i = 0; i < count; i++) {
    const primePool = pools[rule.pool];
    const scope = uniqueScopeFor(config, rule.pool);
    let eligible = primePool;
    if (scope === "brick") eligible = primePool.filter((c) => !state.brickUsed.has(c.model_id));
    if (scope === "case") eligible = primePool.filter((c) => !state.caseUsed.has(c.model_id));
    if (!eligible.length) throw new Error("Prime pool exhausted");

    let primeCandidates = eligible;
    if (rule.printed_rarity_distribution?.length) {
      const availableRarities = rule.printed_rarity_distribution.filter((entry) =>
        eligible.some((card) => card.rarity === entry.rarity),
      );
      if (!availableRarities.length) throw new Error("No configured Prime rarities are available");
      const totalWeight = availableRarities.reduce((sum, entry) => sum + entry.weight, 0);
      let pick = rng.next() * totalWeight;
      let chosenRarity = availableRarities[availableRarities.length - 1].rarity;
      for (const entry of availableRarities) {
        pick -= entry.weight;
        if (pick < 0) {
          chosenRarity = entry.rarity;
          break;
        }
      }
      primeCandidates = eligible.filter((card) => card.rarity === chosenRarity);
    }

    const prime = primeCandidates[rng.int(primeCandidates.length)];
    const categories = rule.target_categories_by_printed_rarity[prime.rarity];
    if (!categories?.length) throw new Error(`No prime targets configured for '${prime.rarity}'`);

    const targets = categories.flatMap((category) => candidateSlots(boosters, category));
    if (!targets.length) throw new Error(`No available slot for ${prime.rarity} Prime '${prime.name}'`);

    const target = targets[rng.int(targets.length)];
    replacements.set(`${target.booster}:${target.slot}`, prime);
    if (scope === "brick") state.brickUsed.add(prime.model_id);
    if (scope === "case") state.caseUsed.add(prime.model_id);
  }
  return replacements;
}

function assignExtras(
  boosters: BoosterResult[], config: SetConfig, pools: Record<string, CatalogCard[]>,
  state: GenerationState, rng: RandomSource, boosterUsed?: Set<string>[]
): void {
  const extras = config.brick.extras;
  if (!extras?.groups?.length) return;

  const assignments: Array<{ pool: string; category: string }> = [];
  for (const group of extras.groups) {
    const count = group.count ?? weightedValue(group.count_distribution ?? [], rng);
    for (let i = 0; i < count; i++) assignments.push({ pool: group.pool, category: group.category });
  }

  if (extras.assignment === "one_per_booster" && assignments.length > boosters.length) {
    throw new Error(`Extras request ${assignments.length} inserts for only ${boosters.length} boosters`);
  }

  const shuffled = rng.shuffle(assignments);
  const targets = rng.shuffle(boosters.map((_, i) => i));
  const extraCounts = boosters.map(() => 0);

  if (extras.assignment === "balanced_displacement") {
    if (assignments.length !== boosters.length) {
      throw new Error("balanced_displacement requires exactly one extra per booster before displacement");
    }
    const distribution = extras.displacement_distribution ?? [{ value: 0, weight: 1 }];
    const displacementCount = weightedValue(distribution, rng);
    if (displacementCount * 2 > boosters.length) {
      throw new Error(`Cannot make ${displacementCount} displacements across ${boosters.length} boosters`);
    }

    // Begin with exactly one extra assigned to each booster. A displacement moves
    // one whole extra assignment from a donor pack to a distinct recipient pack,
    // producing a matched dead/double pair while preserving the brick total.
    const assigned = targets.map((target, i) => ({ target, extra: shuffled[i] }));
    const participants = rng.shuffle(boosters.map((_, i) => i));
    for (let i = 0; i < displacementCount; i++) {
      const donor = participants[i * 2];
      const recipient = participants[i * 2 + 1];
      const donorAssignment = assigned.find((entry) => entry.target === donor);
      if (!donorAssignment) throw new Error("Displacement donor has no extra");
      donorAssignment.target = recipient;
    }

    for (const entry of assigned) {
      boosters[entry.target].extras.push(
        drawCard(entry.extra.pool, entry.extra.category, pools, config, state, rng, boosterUsed?.[entry.target]),
      );
    }
    return;
  }

  for (let i = 0; i < shuffled.length; i++) {
    let target: number;

    if (extras.assignment === "one_per_booster") {
      target = targets[i];
    } else if (extras.assignment === "random_bounded") {
      const maxPerBooster = extras.max_per_booster ?? 2;
      const eligible = boosters
        .map((_, index) => index)
        .filter((index) => extraCounts[index] < maxPerBooster);

      if (!eligible.length) {
        throw new Error(
          `Extras cannot be assigned with max_per_booster=${maxPerBooster}`,
        );
      }

      target = eligible[rng.int(eligible.length)];
    } else {
      target = rng.int(boosters.length);
    }

    const x = shuffled[i];
    boosters[target].extras.push(
      drawCard(x.pool, x.category, pools, config, state, rng, boosterUsed?.[target]),
    );
    extraCounts[target]++;
  }
}

function generateBrickToppers(
  config: SetConfig, pools: Record<string, CatalogCard[]>,
  state: GenerationState, rng: RandomSource
): GeneratedCard[] {
  const toppers: GeneratedCard[] = [];
  for (const group of config.brick.toppers?.groups ?? []) {
    for (let i = 0; i < group.count; i++) {
      toppers.push(drawCard(group.pool, group.category, pools, config, state, rng));
    }
  }
  return toppers;
}

function summarizeBrick(boosters: BoosterResult[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const booster of boosters) {
    for (const card of booster.cards) {
      summary[card.category] = (summary[card.category] ?? 0) + 1;
      if (card.prime) summary.prime = (summary.prime ?? 0) + 1;
    }
    for (const extra of booster.extras) {
      const key = `extra:${extra.category}`;
      summary[key] = (summary[key] ?? 0) + 1;
    }
  }
  return summary;
}

export function generateBrick(
  brickIndex: number, config: SetConfig, pools: Record<string, CatalogCard[]>,
  caseUsed: Set<string>, rng: RandomSource
): BrickResult {
  const profileSlots = rng.shuffle(expandProfiles(config.brick.base_profiles, config.brick.boosters_per_brick));
  const slotPlan: Slot[][] = profileSlots.map((p) => p.map((category) => ({ category, pool: category })));

  applySubstitutions(slotPlan, config, rng);
  const state: GenerationState = { caseUsed, brickUsed: new Set<string>() };
  const primeReplacements = applyPrimes(slotPlan, config, pools, state, rng);

  // G2 adds booster-level uniqueness while G1 remains byte-for-byte compatible
  // with previously issued codes. Duplicates may still appear in different
  // boosters, bricks, and cases according to each pool's configured scope.
  const toppers = generateBrickToppers(config, pools, state, rng);

  const enforceBoosterUniqueness = config.brick.booster_uniqueness ?? config.engine_version >= 2;
  const boosterUsed = enforceBoosterUniqueness
    ? slotPlan.map(() => new Set<string>())
    : undefined;

  const boosters: BoosterResult[] = slotPlan.map((slots, boosterIndex) => ({
    booster_index: boosterIndex + 1,
    profile: profileSlots[boosterIndex],
    cards: slots.map((slot, slotIndex) => {
      const used = boosterUsed?.[boosterIndex];
      const prime = primeReplacements.get(`${boosterIndex}:${slotIndex}`);
      if (prime) {
        if (used?.has(prime.model_id)) {
          throw new Error(`Prime '${prime.name}' would duplicate another pull in booster ${boosterIndex + 1}`);
        }
        used?.add(prime.model_id);
        return { ...prime, category: slot.category, pool: config.brick.prime!.pool };
      }
      return drawCard(slot.pool, slot.category, pools, config, state, rng, used);
    }),
    extras: []
  }));

  assignExtras(boosters, config, pools, state, rng, boosterUsed);
  return {
    brick_index: brickIndex,
    ...(toppers.length ? { toppers } : {}),
    boosters,
    summary: summarizeBrick(boosters),
  };
}

export function generateCase(
  caseIndex: number, config: SetConfig, catalog: Catalog, rng: RandomSource
): CaseResult {
  const pools = buildPools(config, catalog);
  const caseUsed = new Set<string>();
  const bricks: BrickResult[] = [];
  for (let i = 0; i < config.case.bricks_per_case; i++) {
    bricks.push(generateBrick(i + 1, config, pools, caseUsed, rng));
  }
  return { case_index: caseIndex, bricks };
}

function sampleWithoutReplacement<T>(items: T[], count: number, rng: RandomSource): T[] {
  if (count > items.length) throw new Error(`Cannot select ${count} items from only ${items.length}`);
  return rng.shuffle(items).slice(0, count);
}

export function generateForRequest(
  input: GenerateRequest, config: SetConfig, catalog: Catalog, rng: RandomSource
) {
  const count = input.request.count;
  if (!Number.isInteger(count) || count <= 0) throw new Error("request.count must be a positive integer");

  const bricksPerCase = config.case.bricks_per_case;
  const packsPerCase = bricksPerCase * config.brick.boosters_per_brick;

  let casesNeeded: number;
  if (input.request.kind === "cases") casesNeeded = count;
  else if (input.request.kind === "bricks") casesNeeded = Math.ceil(count / bricksPerCase);
  else casesNeeded = Math.ceil(count / packsPerCase);

  const cases: CaseResult[] = [];
  for (let i = 0; i < casesNeeded; i++) cases.push(generateCase(i + 1, config, catalog, rng));

  let selection: unknown;
  if (input.request.kind === "cases") {
    selection = cases;
  } else if (input.request.kind === "bricks") {
    const bricks = cases.flatMap((c) => c.bricks.map((brick) => ({ case_index: c.case_index, brick })));
    selection = sampleWithoutReplacement(bricks, count, rng);
  } else {
    const packs = cases.flatMap((c) =>
      c.bricks.flatMap((b) =>
        b.boosters.map((booster) => ({ case_index: c.case_index, brick_index: b.brick_index, booster }))
      )
    );
    selection = sampleWithoutReplacement(packs, count, rng);
  }

  const caseSummaries = cases.map((c) => ({
    case_index: c.case_index,
    bricks: c.bricks.map((b) => ({ brick_index: b.brick_index, summary: b.summary }))
  }));

  return {
    set: config.set_id,
    set_name: config.name,
    request: input.request,
    generated_case_count: cases.length,
    selection,
    case_summaries: caseSummaries,
    ...(input.debug ? { generated_cases: cases } : {})
  };
}
