# Release Contract

AFKBOT UI ships as an AFKBOT plugin source bundle, not as a Python wheel or npm package.

## What operators install

The installable plugin tree is:

- `.afkbot-plugin/`
- `python/`
- prebuilt `web/dist/`

`afk plugin install ../afkbotui` reads the plugin manifest and mounts the embedded UI directly from `web/dist`. Operators do not need Node.js at install time as long as the repo already contains the built `dist`.

## What maintainers must build

React source lives in `web/src`, but production delivery always comes from `web/dist`.

Before a release or tagged plugin update:

1. Sync the release version in `.afkbot-plugin/plugin.json`, `package.json`, `README.md`, and the top `CHANGELOG.md` entry.
2. Run `npm ci`.
3. Run `npm run build`.
4. Run `npm run release:check`.
5. Run the verification suite:
   - `npm run typecheck`
   - `npm test`
   - `npm run test:coverage`
   - `npm run test:e2e`
6. Inspect `web/dist/index.html` and confirm referenced assets exist in `web/dist/assets/`.
7. Confirm `.gitignore` still covers local artifacts such as `.pytest_cache/`, `.coverage`, `.playwright-cli/`, `output/`, `playwright-report/`, `test-results/`, and `web/coverage/`.
8. Commit the rebuilt `web/dist` output together with the source changes.

## Why `web/dist` matters

The plugin manifest points `paths.web_root` to `web/dist`, so a release without the rebuilt `dist` will boot the wrong UI or fail to load lazy route chunks. The React build must be treated as a release artifact, not as a local-only convenience.

## Mount contract

The canonical mount values live in `.afkbot-plugin/plugin.json`:

- `mounts.api_prefix`
- `mounts.web_prefix`

The frontend build reads those values during Vite build time. If mounts ever change, rebuild `web/dist` before shipping.

`npm run release:check` now also verifies that `web/index.html` source mounts match the manifest and that expected local artifact paths remain ignored, so release drift fails before publish.
