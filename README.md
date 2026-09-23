# HeroClix Sealed Pool Generator

A standalone Cloudflare Worker + static web app for generating reproducible HeroClix sealed product.

There are **no accounts and no database**. Every opening is recreated entirely from a versioned share code.

## Share codes

Example case:

`HC-TB-V1-G1-7M4Q2P8ABC`

Example brick:

`HC-HC-TB-V1-G1-7M4Q2P8ABC-B2`

Example pack:

`HC-HC-HC-TB-V1-G1-7M4Q2P8ABC-B2-P07`

The fields mean:

- `TB` — set code
- `V1` — immutable collation config version
- `G1` — generator algorithm version
- `7M4Q2P8ABC` — random seed
- `B2` — optional brick within the case
- `P07` — optional pack within the brick

The generator always rebuilds the complete parent case from the seed. Brick and pack codes simply select a child from that regenerated case.

That means the same code can be:

- pasted into the website
- shared as a URL
- reported by OCTGN later for sealed-pool verification
- reproduced without storing any generated opening server-side

## Why versions are in the code

A seed is only reproducible if the rules and algorithm remain fixed.

When Thunderbolts collation changes, do **not** edit `v1.json`. Create `v2.json` and update the manifest to make V2 current.

Likewise, if the randomization/generation algorithm changes in a way that would alter results, introduce G2 while preserving G1 behavior.

Old codes therefore remain reproducible.

## Web UI

The Worker deploys the browser interface and API together.

The page supports:

- set dropdown populated from the remote manifest
- Generate Pack
- Generate Brick
- Generate Case
- open any shared case/brick/pack code
- copy code
- copy share URL
- drill down from a case to its bricks and packs
- sorted pull list
- OCTGN `.o8d` download for the currently opened pool

A generated pack is never five independently selected models. The service first generates the complete two-brick case and then selects an intact booster from that case.

## Remote data structure

`DATA_BASE_URL` points to a raw GitHub directory containing:

```text
data/
  manifest.json
  configs/
    thunderbolts/
      v1.json
  catalogs/
    thunderbolts/
      v1.json
```

`manifest.json` determines which sets appear in the dropdown and which config version is current.

The config and catalog files are fetched at runtime and cached briefly, so adding a new set or switching to a new config version does not require changing the website code.

## Thunderbolts V1 model

The included starting configuration uses:

- 2 bricks per case
- 12 boosters per brick
- 5 game pieces per booster

Base brick:

- 8 boosters: `3 Common / 1 Uncommon / 1 Rare`
- 4 boosters: `2 Common / 2 Uncommon / 1 Rare`

Substitutions:

- exactly 3 Rare slots -> Character Super Rare
- exactly 1 Rare slot -> standard Chase
- Prime overlays a Rare or Character SR slot
- SR Equipment replaces a Common
- extra `b` Chase replaces a Common

Extras:

- 8 One-Shots per brick
- 4 terrain pieces per brick
- one extra insert assigned to each booster

These are configuration values, not hard-coded engine rules.

## Local test

Requirements:

- Node.js
- npm

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test
```

Run locally:

```bash
npx wrangler dev
```

Then open the local URL Wrangler prints.

## Deploy to Cloudflare

1. Create a GitHub repository and push this project.
2. Set `DATA_BASE_URL` in `wrangler.jsonc` to the raw GitHub URL of this repo's `data/` directory.
3. Authenticate Wrangler:

```bash
npx wrangler login
```

4. Deploy:

```bash
npx wrangler deploy
```

Cloudflare deploys the Worker API and the files in `public/` together.

## Adding a set

1. Generate or create its catalog.
2. Add an immutable config version such as `data/configs/myset/v1.json`.
3. Add an immutable catalog version such as `data/catalogs/myset/v1.json`.
4. Add the set to `data/manifest.json`.
5. Commit.

It will appear in the set dropdown after the short cache expires.

## OCTGN verification later

The OCTGN integration should never invent its own randomness.

It should request/open a share code and announce the exact code in chat, for example:

`Sealed Pool: HC-HC-HC-TB-V1-G1-7M4Q2P8ABC-B2-P07`

Anyone can paste that code into the website and verify the identical pack.

## OCTGN deck download

The browser currently exports the selected pool in standard OCTGN XML deck form and names the file with the share code. The pool code is also included as an XML comment.

The HeroClix game GUID and deck section are set per set config under `octgn`.


## Current production data source

`https://raw.githubusercontent.com/StormyWaters2021/Pack-Generator-Data/main/`


## UI behavior in v0.4

When a Brick or Case is generated, pack contents remain hidden. Opening a pack keeps the parent Brick/Case on screen, marks the pack as Opened, and adds that pack's contents to the Pulls panel. The newest pack's added rows are bold until another pack is opened.

The Pulls panel scrolls independently on desktop and the OCTGN export contains the packs opened in the current browser session.

## Theme

The page uses the same core light/dark palette as the TCG Deck Builder:

- dark: `#181a1b` body, `#2a2a2a` panels, `#23272a` inputs, gold `#ffd700` / `#b7950b`
- light: `#f8f9fa` body, `#f5f5f5` panels, white inputs, blue `#0056b3` / `#2980b9`

The selected theme is stored locally in the browser.

## Thunderbolts V1 insert placement

Thunderbolts V1 is still the working pre-release configuration. It currently keeps the brick-level baseline of 8 One-Shots and 4 terrain pieces, but does not force exactly one insert into every booster. Inserts are distributed deterministically across the brick with a maximum of two per booster.

Do not create V2 until V1 is explicitly declared live/frozen.
