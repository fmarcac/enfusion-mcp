# Changelog

Maintained private fork of [steffenbk/enfusion-mcp-BK](https://github.com/steffenbk/enfusion-mcp-BK)
(itself a fork of Articulated7/enfusion-mcp). Versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Added
- **Linux / Proton Workbench launcher.** The Windows Workbench `.exe` can now be
  launched on Linux. New `launcher` config (`auto` | `native` | `proton` | `steam`,
  default `auto` → Proton on Linux). Auto-detects the Proton install, Steam root,
  and the Tools `compatdata` prefix; runs the exe via `proton run` with the Steam
  compat env, or via `steam -applaunch <appid>`. New env vars:
  `ENFUSION_WB_LAUNCHER`, `ENFUSION_PROTON_PATH`, `ENFUSION_STEAM_ROOT`,
  `ENFUSION_STEAM_COMPAT_DATA_PATH`, `ENFUSION_STEAM_APPID`.

### Changed
- **Reforger 1.7 API index re-scraped** from the 1.7 Tools docs. The scraper is now
  layout-agnostic (matches doc pages by basename) because 1.7 nests the Doxygen
  pages under `…/html/` *and* merges the Enfusion + Arma APIs into the single
  `ArmaReforgerScriptAPIPublic.zip`  -  the old fixed-prefix lookup found nothing.
- MCP version is now read from `package.json` (was hardcoded and stale).

### Fixed
- `gamePath` auto-derive no longer clobbers an explicit `gamePath` from a config
  file/env (it only derives when still at the default). This previously sent
  `asset_search`/`game_read` to the wrong directory.
- Updated stale `requireEditMode`/`requirePlayMode` tests to match the intended
  block-on-unknown-mode behavior.

### Known pre-existing issues (inherited from the fork, not yet fixed)
- `tests/formats/enfusion-text.test.ts` "serializes minimal node": the node-ID
  quoting heuristic emits some IDs bare; the real mod-scaffold path uses the
  `generateGproj` template, so this doesn't affect generated `.gproj` files.
- `tests/animation/integration-m151a2.test.ts`: integration test requiring
  game-asset fixtures not present in the repo.
