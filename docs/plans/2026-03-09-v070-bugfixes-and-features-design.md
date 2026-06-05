# v0.7.0 Design  -  Bug Fixes + Features

**Date:** 2026-03-09
**Release type:** Minor (v0.6.4 → v0.7.0)
**Scope:** 10 bug fixes + 3 features

---

## Bug Fixes

### 1.1 Socket double-processing (client.ts:491-544)

**Problem:** Both `socket.on("end")` and `socket.on("close")` decode the same response buffer. If both fire, resources are wasted; if `close` fires first without `end`, behavior is undefined.

**Fix:** Remove response decoding from `close` handler. Only decode in `end`. The `close` handler ensures cleanup runs and rejects if `end` never fired.

### 1.2 PAK reader bounds checks (reader.ts:73, 131-135)

**Problem:** No bounds validation on `chunkLen` or `nameLen` in PAK binary parsing. Malformed PAK files cause silent corruption or out-of-bounds reads.

**Fix:**
- Add `chunkLen + pos + 8 > fileSize` guard before advancing position
- Add `state.offset + nameLen > buf.length` guard before reading entry names
- Both throw descriptive errors

### 1.3 Scenario cleanup on partial failure (wb-scenario.ts)

**Problem:** If property-setting fails after entities are placed, the scene is left in a partial state with orphaned entities.

**Fix:** Track all created entity names. On critical failure, delete all placed entities before returning the error. Add `cleanupEntities()` helper.

### 1.4 Enfusion text escaping (enfusion-text.ts:80-86, 391-392)

**Problem:**
- Parser doesn't handle `\n`, `\t` escape sequences (only `\\` and `\"`)
- Serializer doesn't escape newlines/tabs in output strings, producing malformed .et files

**Fix:**
- Parser: recognize standard escape sequences (`\n`, `\t`, `\\`, `\"`)
- Serializer: escape newlines and tabs when writing string values

### 1.5 extractParamNames default values (script.ts:347-354)

**Problem:** `extractParamNames("void OnInit(IEntity owner = null)")` extracts `null)` instead of `owner`.

**Fix:** Strip `= defaultValue` from each parameter before extracting the last word. Split on `=`, take left side, then extract name.

### 1.6 PAK file size check before read (game-read.ts)

**Problem:** In the PAK path, `readTextFile()` loads the entire file into memory before the size check runs.

**Fix:** Move `fileSize > 512_000` check before `pakVfs.readTextFile()`.

### 1.7 Partial handler installation rollback (client.ts:427)

**Problem:** If `copyFileSync()` fails mid-loop, the target directory exists with partial scripts. Subsequent calls see the directory and skip reinstall, leaving handlers broken.

**Fix:** If any copy fails, delete the target directory entirely so the next call retries from scratch.

### 1.8 Pattern name collision detection (mod-create.ts:150-162)

**Problem:** If a pattern defines scripts that resolve to the same filename after `{PREFIX}` replacement, the second silently overwrites the first.

**Fix:** Collect all generated file paths before writing. If duplicates exist, return an error listing the collisions.

### 1.9 Surface GUID index errors to user (asset-search.ts:119-128)

**Problem:** GUID index build errors are logged to stderr but not included in tool responses. Users get silently degraded search results.

**Fix:** Include `cachedGuidDiag` warning in the tool response content when it contains an error.

### 1.10 Protocol incomplete response detection (protocol.ts:105-119)

**Problem:** When Workbench returns status `"Ok"` but the payload is missing or truncated, `decodeResponse()` returns `{}` silently.

**Fix:** When status is `"Ok"` but no payload follows, throw `WorkbenchError` with code `PROTOCOL_ERROR`.

---

## Features

### 2.1 Config Validation (#9 from UPGRADE_IDEAS.md)

**Goal:** Extend `mod_validate` to semantically check `.conf` files beyond parse verification.

**Approach:**
- Walk parsed `.conf` AST nodes, extract type names (node class names)
- Validate each against `SearchEngine.hasClass()`
- Return warnings (not errors) for unrecognized classes  -  they could be from other mods
- Validate known config types have required fields:
  - Faction configs: `m_sKey` required
  - Entity catalogs: `m_aEntries` required

**Files:**
- `src/tools/mod-validate.ts`  -  extend `checkConfigs()`
- `tests/tools/config-validate.test.ts`  -  new test cases

**Effort:** S

### 2.2 Fuzzy Search (#12 from UPGRADE_IDEAS.md)

**Goal:** Add typo-tolerant search so queries like `"ScriptCompnent"` or `"GetPositon"` find results.

**Approach:**
- New utility `src/utils/fuzzy.ts`:
  - `levenshtein(a, b)`  -  edit distance
  - `trigramSimilarity(a, b)`  -  character trigram overlap ratio
- Integrate into `SearchEngine` scoring as fallback:
  - Only activate when strict matching (exact/prefix/substring) returns <3 results
  - Scoring: exact=100, prefix=80, substring=60, Levenshtein-1=40, Levenshtein-2=20, trigram>0.3=15
  - Cap fuzzy results at 10
- Applied to: `searchClasses`, `searchMethods`, `searchEnums`, `searchProperties`

**Files:**
- New `src/utils/fuzzy.ts`
- `src/index/search-engine.ts`  -  integrate fuzzy fallback
- `tests/index/search-engine.test.ts`  -  fuzzy test cases
- New `tests/utils/fuzzy.test.ts`

**Effort:** M

### 2.3 Auto-Fetch Parent Methods (#14 from UPGRADE_IDEAS.md)

**Goal:** `script_create` should pull real overridable methods from the API index instead of relying on hardcoded method lists.

**Approach:**
- Pass `SearchEngine` into `registerScriptCreate()` via `server.ts`
- Before calling `generateScript()`, look up `parentClass` in the index:
  - `searchEngine.getClass(parentClass)` for direct methods
  - `searchEngine.getInheritedMembers(parentClass)` for inherited methods
  - Filter for virtual/overridable methods (heuristic: has `override` keyword, or known lifecycle pattern)
- Fall back to hardcoded lists (`GAMEMODE_METHODS`, `COMPONENT_METHODS`) if class not found in index
- Hardcoded lists remain as defaults, not deleted

**Files:**
- `src/server.ts`  -  pass `searchEngine` to `registerScriptCreate()`
- `src/tools/script-create.ts`  -  accept and use `SearchEngine`
- `src/templates/script.ts`  -  accept dynamic method list
- `tests/templates/script.test.ts`  -  test with API data

**Effort:** M

---

## Work Parallelization

Tasks are grouped into independent work streams for parallel agent execution:

| Stream | Tasks | Dependencies |
|--------|-------|--------------|
| A: Core parser fixes | 1.4, 1.5 | None |
| B: Workbench client fixes | 1.1, 1.7, 1.10 | None |
| C: PAK/asset fixes | 1.2, 1.6, 1.9 | None |
| D: Tool-level fixes | 1.3, 1.8 | None |
| E: Config validation | 2.1 | None |
| F: Fuzzy search | 2.2 | None |
| G: Auto-fetch methods | 2.3 | None (uses SearchEngine read-only) |

All 7 streams are independent and can run in parallel.

---

## Testing Strategy

- Each fix/feature includes unit tests
- Run full suite (`npm test`) after all streams merge
- Manual smoke test: create a mod with `mod_create`, validate with `mod_validate`, search with typos

## Release

- Version bump to 0.7.0
- Update README tools table if tool descriptions change
- Update UPGRADE_IDEAS.md to mark #9, #12, #14 as done
- Update TODO.md to remove fixed bugs
