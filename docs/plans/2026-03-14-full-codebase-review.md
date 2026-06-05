# enfusion-mcp Full Codebase Review  -  2026-03-14

Comprehensive review by 6 parallel agents covering all 81 source files and 19 test files.

---

## Executive Summary

The codebase is well-structured with clear separation of concerns, consistent tool registration patterns, solid path traversal protection, and clean protocol implementation. However, the review uncovered **8 critical**, **12 high**, **22 medium**, and **16 low** severity issues across security, correctness, reliability, and test coverage.

**Top priorities:**
1. Missing edit-mode guards on destructive workbench tools (3 critical)
2. Arbitrary command execution via `wb_execute_action` (critical)
3. Path traversal gaps in `mod_validate`, `mod_build`, `wb_cleanup` (high)
4. Memory exhaustion vectors in PAK reader and TCP client (critical/high)
5. Tautological test files providing false coverage (critical for test quality)

---

## CRITICAL Issues (8)

### C1. `wb_execute_action`  -  arbitrary command execution, no validation
**File:** [wb-execute-action.ts:20-24](src/tools/wb-execute-action.ts#L20-L24)
Accepts arbitrary `menuPath` and forwards directly to Workbench with no allowlist, blocklist, or mode guard. A confused LLM could invoke destructive menu actions.
**Fix:** Add allowlist of safe menu paths; add `requireEditMode` for mutating actions.

### C2. `wb_entity_duplicate`  -  no edit-mode guard on destructive operations
**File:** [wb-entity-duplicate.ts:64-263](src/tools/wb-entity-duplicate.ts#L64-L263)
Deletes and creates entities without calling `requireEditMode`. Every other mutating tool does.
**Fix:** Add `requireEditMode(client, "duplicate entity")` at handler top.

### C3. `scenario_create_objective`  -  no edit-mode guard on multi-entity creation
**File:** [wb-scenario.ts:88-241](src/tools/wb-scenario.ts#L88-L241)
Creates 5+ entities and modifies many properties without checking edit mode. Partial failure leaves orphaned entities.
**Fix:** Add `requireEditMode` at handler start.

### C4. PAK reader  -  recursive parsing vulnerable to stack overflow
**File:** [reader.ts:134-191](src/pak/reader.ts#L134-L191)
`parseEntry` is recursive despite comment claiming iterative approach. No depth limit. `childCount` read as UInt32LE (up to 4B) with no sanity cap. Malformed PAK can crash the server.
**Fix:** Add recursion depth limit (e.g., 64); cap `childCount` relative to remaining buffer size.

### C5. VFS path normalization  -  case-sensitivity mismatch
**File:** [vfs.ts:258-263](src/pak/vfs.ts#L258-L263)
`normalizePath` doesn't lowercase, but Enfusion on Windows is case-insensitive. Lookups against Maps fail silently for case mismatches.
**Fix:** Lowercase in `normalizePath` or use case-insensitive Map strategy.

### C6. Massive code duplication  -  `animation-graph-author.ts` and `animation-graph-setup.ts`
**Files:** [animation-graph-author.ts](src/tools/animation-graph-author.ts), [animation-graph-setup.ts](src/tools/animation-graph-setup.ts)
~400 lines of `generateAgr()`/`generateAst()` fully duplicated. Bug fixes in one will be missed in the other.
**Fix:** Extract shared generators into `src/templates/animation-graph.ts`.

### C7. `workshop-info.ts`  -  crashes when `basePath` is undefined
**File:** [workshop-info.ts:36-38](src/tools/workshop-info.ts#L36-L38)
If both `projectPath` and `config.projectPath` are falsy, `resolve(undefined, ...)` silently resolves to CWD, leaking directory contents.
**Fix:** Add early guard returning error when `basePath` is falsy.

### C8. Test files `config-validate.test.ts` and `mod-validate.test.ts` are tautological
**Files:** [config-validate.test.ts](tests/tools/config-validate.test.ts), [mod-validate.test.ts](tests/tools/mod-validate.test.ts)
Every test only asserts that `existsSync()` returns true after fixture setup. Zero behavioral validation. These create false confidence in test coverage.
**Fix:** Actually import and call validation functions against fixtures, or remove.

---

## HIGH Issues (12)

### H1. `mod_validate`  -  no path traversal protection on `projectPath`
**File:** [mod-validate.ts:319](src/tools/mod-validate.ts#L319)
Unlike `project_read`/`project_write` which use `validateProjectPath`, this tool reads file contents from arbitrary directories.

### H2. `mod_build`  -  command injection risk via unvalidated paths
**File:** [mod-build.ts:125-139](src/tools/mod-build.ts#L125-L139)
`addonName`, `outputPath` passed to `spawn()` without sanitization. `outputPath` used in `resolve()` without traversal validation.

### H3. `wb_cleanup`  -  no path validation on `modDir` before `rmSync`
**File:** [wb-launch.ts:99-100](src/tools/wb-launch.ts#L99-L100)
User-supplied `modDir` passed directly to cleanup which deletes `Scripts/WorkbenchGame/EnfusionMCP/` inside it.

### H4. `socket.write()` return value not checked; no backpressure handling
**File:** [client.ts:574-575](src/workbench/client.ts#L574-L575)
**Fix:** Use `socket.end(requestBuf)` to combine final write and FIN.

### H5. No upper bound on Pascal string length  -  memory exhaustion from malformed response
**File:** [protocol.ts:45-61](src/workbench/protocol.ts#L45-L61)
Malformed response declaring 2GB string length would attempt massive allocation.
**Fix:** Add MAX_STRING_LENGTH constant (e.g., 16MB).

### H6. No cap on accumulated TCP response data in `rawCall()`
**File:** [client.ts:496-498](src/workbench/client.ts#L496-L498)
Chunks accumulated without size limit. 10s timeout + high throughput = hundreds of MB.
**Fix:** Add MAX_RESPONSE_SIZE check in data handler.

### H7. `rawCall` resolves `{} as T` on empty response  -  silent type lie
**File:** [client.ts:506-508](src/workbench/client.ts#L506-L508)
Callers expect type `T` but get empty object. Should reject with PROTOCOL_ERROR.

### H8. `wb_entity_duplicate`  -  delete-before-create race loses entity on failure
**File:** [wb-entity-duplicate.ts:185-243](src/tools/wb-entity-duplicate.ts#L185-L243)
Reads position, deletes original, creates new. If create fails, entity is lost.
**Fix:** Create first, then delete original only after success.

### H9. Mode guards rely on stale cached state
**File:** [status.ts:19-35](src/workbench/status.ts#L19-L35)
`requireEditMode` only checks cached `client.state.mode`. Passes when mode is `"unknown"`.
**Fix:** Also block on `"unknown"` for destructive operations; consider refreshing state.

### H10. `wb_launch`  -  `timeoutSeconds` parameter accepted but never used
**File:** [wb-launch.ts:22-40](src/tools/wb-launch.ts#L22-L40)
Schema defines it but handler ignores it. Misleading to users.

### H11. `wb_script_editor`  -  mutating operations have no edit-mode guard
**File:** [wb-script-editor.ts:32-177](src/tools/wb-script-editor.ts#L32-L177)
`setLine`, `insertLine`, `removeLine` modify files without mode check.

### H12. `wb_entity_duplicate`  -  missing `extractedPath`/PAK VFS search fallback
**File:** [wb-entity-duplicate.ts:110-128](src/tools/wb-entity-duplicate.ts#L110-L128)
Only searches loose game data, unlike `game-duplicate.ts` which checks extracted + PAK.

---

## MEDIUM Issues (22)

| # | File | Issue |
|---|------|-------|
| M1 | [config.ts:50-60](src/config.ts#L50-L60) | `JSON.parse` cast to `Partial<Config>` without runtime validation |
| M2 | [config.ts:72-73](src/config.ts#L72-L73) | `Object.assign` allows null/undefined to overwrite defaults |
| M3 | [client.ts:263](src/workbench/client.ts#L263) | `execSync("taskkill")` blocks event loop |
| M4 | [client.ts:350-364](src/workbench/client.ts#L350-L364) | `findFallbackGproj` picks arbitrary first `.gproj` |
| M5 | [index.ts:13](src/index.ts#L13) | Hardcoded version `"0.6.5"` drifts from package.json |
| M6 | [search-engine.ts:55](src/index/search-engine.ts#L55) | Synchronous index loading blocks event loop at startup |
| M7 | [search-engine.ts:412-463](src/index/search-engine.ts#L412-L463) | `searchAny` lacks fuzzy fallback unlike individual methods |
| M8 | [search-engine.ts:472-493](src/index/search-engine.ts#L472-L493) | Wiki search: `toLowerCase()` on every content string per query |
| M9 | [enfusion-text.ts:300-318](src/formats/enfusion-text.ts#L300-L318) | Ambiguous lookahead can misparse `Ident Ident String` |
| M10 | [animation-graph-author.ts:363](src/tools/animation-graph-author.ts#L363) | Odd wheel count causes fractional axle count |
| M11 | [animation-graph-inspect.ts:89](src/tools/animation-graph-inspect.ts#L89) | Regex `[^"\\n\\r]` should be `[^"\n\r"]`  -  skips `n` and `r` chars |
| M12 | [asset-search.ts:32-34](src/tools/asset-search.ts#L32-L34) | Cache key doesn't include `gamePath`  -  stale PAK data |
| M13 | [prefab-inspect.ts:86-132](src/tools/prefab-inspect.ts#L86-L132) | No file size limit on reads (recursively reads inheritance chain) |
| M14 | [mod-validate.ts:111-148](src/tools/mod-validate.ts#L111-L148) | `readFileSync` all matching files with no size limit |
| M15 | [wb-entities.ts:301](src/tools/wb-entities.ts#L301) | Sends `value: ""` for read-only actions |
| M16 | [wb-entities.ts:282-284](src/tools/wb-entities.ts#L282-L284) | Edit-mode guard blocks read-only actions unnecessarily |
| M17 | [wb-layers.ts:6](src/tools/wb-layers.ts#L6) | Incomplete `MUTATING_LAYER_ACTIONS` set |
| M18 | [wb-localization.ts:32-111](src/tools/wb-localization.ts#L32-L111) | insert/delete/modify have no edit-mode guard |
| M19 | [wb-resources.ts:27-89](src/tools/wb-resources.ts#L27-L89) | register/rebuild have no edit-mode guard |
| M20 | [wb-scenario.ts:220](src/tools/wb-scenario.ts#L220) | Missing `formatConnectionStatus` footer |
| M21 | [game-paths.ts:20-38](src/utils/game-paths.ts#L20-L38) | `findLooseFile` doesn't validate `relativePath` for traversal |
| M22 | [source-remote.ts:53-88](src/scraper/source-remote.ts#L53-L88) | Rate limiting fires all concurrent requests at once (burst) |

---

## LOW Issues (16)

| # | File | Issue |
|---|------|-------|
| L1 | [client.ts:471](src/workbench/client.ts#L471) | `removeAllListeners()` is overly broad |
| L2 | [client.ts:148-160](src/workbench/client.ts#L148-L160) | Unused `launching` field (dead code) |
| L3 | [protocol.ts:96](src/workbench/protocol.ts#L96) | Protocol version never validated in response |
| L4 | [enfusion-text.ts:362-391](src/formats/enfusion-text.ts#L362-L391) | `parseNodeMultiIdent` is dead code |
| L5 | [enfusion-text.ts:128](src/formats/enfusion-text.ts#L128) | Tokenizer silently skips unknown characters |
| L6 | [enfusion-text.ts:421](src/formats/enfusion-text.ts#L421) | GUID detection regex may false-positive |
| L7 | [script.ts:349-361](src/templates/script.ts#L349-L361) | `extractParamNames` doesn't strip `[N]` from array params |
| L8 | [vfs.ts:44-45](src/pak/vfs.ts#L44-L45) | Singleton cache doesn't normalize `gamePath` |
| L9 | [mod-create.ts:185](src/tools/mod-create.ts#L185) | `scriptType as any` bypasses type safety |
| L10 | [wb-editor.ts:148-180](src/tools/wb-editor.ts#L148-L180) | Undo/redo missing mode guard |
| L11 | [wb-entity-duplicate.ts](src/tools/wb-entity-duplicate.ts) | Missing `formatConnectionStatus` on all responses |
| L12 | Multiple wb-*.ts | Inconsistent `type: "text"` vs `type: "text" as const` |
| L13 | Multiple wb-*.ts | Mixed handler name conventions (EMCP_WB_ vs bare) |
| L14 | [resources/](src/resources/) | URIs not encoded  -  special chars in names break URIs |
| L15 | [patterns/loader.ts:54](src/patterns/loader.ts#L54) | JSON parsed with unsafe `as` cast, no validation |
| L16 | tsconfig.json | Base config allows accidental emit (no `noEmit`) |

---

## Test Coverage Summary

**Coverage by file count: ~17%** (19 test files covering ~12 of 70+ source modules)

### Well-tested modules
- `src/formats/enfusion-text.ts`  -  strong round-trip tests
- `src/templates/*` (except layout.ts)  -  thorough behavioral tests
- `src/utils/safe-path.ts`  -  security-critical, well covered
- `src/pak/reader.ts`, `src/pak/vfs.ts`  -  synthetic PAK tests
- `src/workbench/protocol.ts`, `src/workbench/client.ts`  -  mock TCP server tests
- `src/index/search-engine.ts`  -  comprehensive search tests

### Untested modules (42 tool files have ZERO tests)
Every `src/tools/*.ts` file except partial coverage of `api-search` (tree formatting only).

### Test bugs
1. `config-validate.test.ts` / `mod-validate.test.ts`  -  tautological (only test fixture setup)
2. `api-search-tree.test.ts`  -  conditional guards silently skip assertions
3. `search-engine.test.ts`  -  depends on live scraped data (integration test posing as unit test)

### Top 5 missing test priorities
1. `src/config.ts`  -  env var cascade, port validation
2. `src/templates/layout.ts`  -  non-trivial widget logic, zero tests
3. `src/tools/mod-validate.ts`  -  actual validation rules
4. `src/tools/script-create.ts`  -  tool layer wrapping generateScript
5. `src/tools/project-write.ts`  -  filesystem writes with path validation

---

## Architecture Notes

**What is done well:**
- Clean tool registration pattern via standalone functions
- All logging to stderr (correct for stdio MCP transport)
- Layered config precedence (defaults -> file -> env)
- PAK VFS merge strategy (alphabetical, first wins)
- Path traversal protection in safe-path.ts
- Handler script installer has rollback on partial failure

**Structural concerns:**
- `server.ts` has 44 imports / 44 registrations (linear growth)
- No graceful shutdown / `dispose()` method
- No client.md in project root for contributor guidance
- `ENFUSION_EXTRACTED_PATH` and `ENFUSION_MCP_DATA_DIR` undocumented in README
- No concurrent tool call protection (especially risky for `scenario_create_objective`)

---

## Recommended Fix Priority

### Immediate (before next release)
1. Add `requireEditMode` to `wb_entity_duplicate`, `scenario_create_objective`, `wb_script_editor`
2. Add validation/allowlist to `wb_execute_action`
3. Add path traversal protection to `mod_validate`
4. Add MAX_RESPONSE_SIZE guard in `rawCall()`
5. Fix `rawCall` empty response handling (reject instead of `{} as T`)
6. Fix regex bug in `animation-graph-inspect.ts`

### Soon after
7. Add max string length in protocol decoder
8. Add recursion depth limit in PAK reader
9. Lowercase VFS path normalization
10. Fix or remove tautological test files
11. Extract animation-graph code duplication
12. Add config validation with zod
13. Fix `wb_entity_duplicate` delete-before-create order
