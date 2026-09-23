# Deployment Checklist

## 1. Put the project in GitHub

Create a repository for the sealed-pool generator and push the project.

The same repository can hold both:

- Worker/web code
- `data/` configs and catalogs

No database is required.

## 2. Set the raw data URL

Edit `wrangler.jsonc`.

The Worker is already configured to use:

`https://raw.githubusercontent.com/StormyWaters2021/Pack-Generator-Data/main/`

No data URL edit is required.

## 3. Install dependencies

```bash
npm install
```

## 4. Test

```bash
npm test
```

Both tests should pass:

- complete case/brick/booster structure
- deterministic share-code replay

## 5. Log into Cloudflare

```bash
npx wrangler login
```

A browser window will ask you to authorize Wrangler.

## 6. Deploy

```bash
npx wrangler deploy
```

Wrangler will print the deployed `workers.dev` URL.

The same deployment serves:

- `/` — web interface
- `/api/sets`
- `/api/generate`
- `/api/open`
- `/api/health`

## 7. Test a shared code

Generate a case in the browser, copy its code, reload the page, and paste the code into "Open a shared code."

The result should be identical.

You can also share a URL like:

`https://YOUR-WORKER.workers.dev/?code=HC-TB-V1-G1-7M4Q2P8ABC-B2-P07`

## Updating collation later

Do not edit an already-published version if you want old codes to remain reproducible.

Instead:

1. copy `data/configs/thunderbolts/v1.json` to `v2.json`
2. make the changes in V2
3. update `current_config_version` in `data/manifest.json` to `2`
4. commit

New openings will use V2. Existing V1 codes continue to regenerate using V1.

No Worker deployment is necessary for config-only changes.
