# Workbench API Expansion  -  Design Spec

**Date:** 2026-03-19
**Version target:** v0.8.0
**Source:** IDA Pro binary analysis of `ArmaReforger_Workbench.exe` (branch `continuous_branches_stable_1.4.0`)

---

## Motivation

IDA Pro reverse engineering of the Workbench binary revealed confirmed native API methods that the MCP server does not yet expose. This spec covers 8 items: 1 bug fix, 6 new actions on existing tools, 1 new tool. All methods referenced are confirmed present in the binary via string/RTTI analysis.

## Scope

- 2 new files created (`wb-compile.ts`, `EMCP_WB_Compile.c`)
- 8 existing files changed
- No breaking changes to existing tool interfaces
- No new dependencies

---

## 1. Bug Fix: `wb_localization getTable` Returns Empty

### Problem

`EMCP_WB_Localization.c` line 168 sets `resp.tableItemCount = table.GetNumChildren()` but never populates an entries array. The TypeScript tool (`wb-localization.ts` line 75) expects `result.entries` as an array  -  it always evaluates to `[]`.

### Fix

Expand the handler response to include an `entries` array. Iterate `table.GetChild(i)` for each child, extract `Id`, `en_us`, `target`, `comment` properties via `BaseContainer.Get()`, and serialize via `OnPack()`.

**Handler changes (`EMCP_WB_Localization.c`):**

```
// In response class, add:
ref array<ref EMCP_WB_LocalizationEntry> m_aEntries;

// In OnPack():
StartArray("entries");
for each entry: pack { id, en_us, target, comment }
EndArray();

// In getTable action:
for (int i = 0; i < childCount && i < 500; i++)
{
    BaseContainer child = table.GetChild(i);
    // Extract Id, en_us, target, comment
    // Add to m_aEntries
}
```

Cap at 500 entries to prevent oversized responses.

**TypeScript changes (`wb-localization.ts`):** Minimal  -  the tool already expects the right shape. Just ensure fallback for `comment` column.

---

## 2. New Actions on `wb_entity_modify`

### 2a. `getWorldTransform`

Returns the entity's world-space position, rotation, and scale.

**Native API:** `GetWorldTransformAxis()` (confirmed at `0x142c71e90`)

**Parameters:**
- `name` (string, required)  -  entity name
- `action` = `"getWorldTransform"`

**Returns:**
```json
{
  "position": "x y z",
  "rotation": "yaw pitch roll",
  "scale": "x y z"
}
```

**Handler logic (`EMCP_WB_ModifyEntity.c`):**
```
IEntitySource src = api.FindEntityByName(name);
vector mat[4];
src.GetWorldTransform(mat);
// mat[0]=right, mat[1]=up, mat[2]=forward, mat[3]=position
// Extract euler angles from rotation matrix
```

**TypeScript:** Add `"getWorldTransform"` to action enum. Non-mutating  -  no edit mode check needed. Format output as readable position/rotation.

### 2b. `makeVisible`

Scrolls the World Editor viewport and entity hierarchy panel to focus on the named entity.

**Native API:** `_WB_MakeVisible()` (confirmed at `0x142c45198`)

**Parameters:**
- `name` (string, required)  -  entity name
- `action` = `"makeVisible"`

**Returns:** Success/failure message.

**Handler logic (`EMCP_WB_ModifyEntity.c`):**
```
IEntitySource src = api.FindEntityByName(name);
api.SetSelection(src);  // select it first
// The editor auto-scrolls to selection
```

Note: If `_WB_MakeVisible()` is not directly accessible via `IEntitySource`, the fallback is to select the entity (which auto-reveals it in the hierarchy). IDA confirms `SetSelection` at `0x1428c2e10`.

**TypeScript:** Add `"makeVisible"` to action enum. Non-mutating.

---

## 3. New Actions on `wb_layers`

### 3a. `isVisible`

Queries the visibility and lock state of a specific layer.

**Native API:** Layer flags already read in `EMCP_WB_Layers.c` for the `list` action. This just does it for a single layer by path.

**Parameters:**
- `action` = `"isVisible"`
- `layerPath` (string, required)
- `subScene` (int, default 0)

**Returns:**
```json
{ "visible": true, "locked": false }
```

**Handler logic:** Find layer by path, read `IsVisible()` and `IsLocked()` flags.

### 3b. `getInfo`

Returns detailed info about a single layer.

**Parameters:**
- `action` = `"getInfo"`
- `layerPath` (string, required)
- `subScene` (int, default 0)

**Returns:**
```json
{
  "layerPath": "default",
  "entityCount": 42,
  "visible": true,
  "locked": false,
  "active": true,
  "layerID": 3
}
```

**Handler logic:** Same as `list` but for a single layer  -  get entity count, flags, check if it's the active layer.

### 3c. `toggleVisibility`

Flips a layer's visibility without needing to query first.

**Parameters:**
- `action` = `"toggleVisibility"`
- `layerPath` (string, required)
- `subScene` (int, default 0)

**Returns:**
```json
{ "visible": false }
```
(the new state after toggling)

**Handler logic:** Read current visibility, set to opposite, return new value. Requires edit mode.

**Files changed:** `EMCP_WB_Layers.c`, `wb-layers.ts`

---

## 4. New Action on `wb_resources`: `browse`

Lists resources in a given directory path within the resource database.

**Parameters:**
- `action` = `"browse"`
- `path` (string, required)  -  directory path, e.g. `"Prefabs/Characters/"`

**Returns:**
```json
{
  "entries": [
    { "name": "Soldier_US.et", "type": "EntityPrefab", "path": "Prefabs/Characters/Soldier_US.et" },
    ...
  ],
  "count": 15
}
```

Cap at 200 entries.

**Handler logic (`EMCP_WB_Resources.c`):**
Use `ResourceManager` to enumerate resources. The ResourceManager module provides directory iteration via its script API. If direct directory listing isn't available via `ResourceManager`, fall back to using `Workbench.SearchResources()` with the path as a prefix filter.

**TypeScript (`wb-resources.ts`):** Add `"browse"` to action enum. Non-mutating.

---

## 5. Enhanced `listProperties` on `wb_entity_modify`

### Current State

`listProperties` returns property names as a flat string list.

### Enhancement

Return property name, type, and current value (for scalar types).

**Native API:** `GetVariableType()` (confirmed at `0x142c606f0`), `GetVariableCount()` (`0x142d9b498`), `GetVariableName()` (`0x142d9b4b0`)

**Handler changes (`EMCP_WB_ModifyEntity.c`):**

For each variable on the entity source:
```
int count = src.GetVariableCount();
for (int i = 0; i < count; i++)
{
    string name = src.GetVariableName(i);
    string type = src.GetVariableType(i);  // e.g. "string", "float", "int", "bool", "object", "array"
    string value = "";
    src.Get(name, value);  // try string extraction
    // Pack { name, type, value }
}
```

**TypeScript (`wb-entities.ts`):** Format as a table:
```
| Property | Type | Value |
|----------|------|-------|
| coords   | vector | 100 0 200 |
| m_fScale | float  | 1.0 |
```

---

## 6. New Tool: `wb_compile`

Triggers script compilation (equivalent to Ctrl+F7 in Workbench).

**Native API:** `CompileScript()` (confirmed at `0x142d10368`)

### New Handler: `EMCP_WB_Compile.c`

```
class EMCP_WB_Compile : NetApiHandler
{
    // No request params needed
    // Call Workbench.ScriptCompile() or equivalent
    // Return success + error/warning count
}
```

The exact script API for triggering compilation needs verification. Candidates:
1. `Workbench.CompileScript()`  -  if exposed to script
2. `ScriptEditor.CompileAll()`  -  via ScriptEditor module
3. `Workbench.RunAction("Compile")`  -  via action system

The handler should capture compilation errors if possible (may require polling or callback).

### New TypeScript: `wb-compile.ts`

```typescript
export function registerWbCompile(server: McpServer, client: WorkbenchClient): void {
  server.registerTool("wb_compile", {
    description: "Compile all scripts in the current Workbench project (equivalent to Ctrl+F7). Returns compilation status and any errors.",
    inputSchema: {}
  }, async () => {
    const result = await client.call("EMCP_WB_Compile", {});
    // Format: success/failure + error list
  });
}
```

**Registration:** Add to Phase 4 in `server.ts`.

---

## 7. Localization `listLanguages` Action

Lists available language properties in the string table.

**Parameters:**
- `action` = `"listLanguages"`

**Returns:**
```json
{ "languages": ["en_us", "fr_fr", "de_de", "es_es"] }
```

**Handler logic (`EMCP_WB_Localization.c`):**
Get the first table entry, iterate its variable names, filter to known language property pattern (lowercase with underscore, e.g., `xx_yy`). Return as array.

**TypeScript (`wb-localization.ts`):** Add to action enum, format as list.

---

## Testing Strategy

- **Unit tests:** Not applicable for live Workbench tools (no mock for TCP + WB)
- **Manual verification:** Each item tested against a running Workbench instance
- **Regression:** Existing tool behavior unchanged  -  all changes are additive (new actions, not modified actions)
- **Safety:** All new mutating actions go through `requireEditMode()` guard

## File Change Summary

| File | Change Type |
|------|-------------|
| `mod/.../EMCP_WB_Localization.c` | Fix getTable + add listLanguages |
| `mod/.../EMCP_WB_ModifyEntity.c` | Add getWorldTransform + makeVisible |
| `mod/.../EMCP_WB_Layers.c` | Add isVisible + getInfo + toggleVisibility |
| `mod/.../EMCP_WB_Resources.c` | Add browse |
| `mod/.../EMCP_WB_Compile.c` | **New file** |
| `src/tools/wb-localization.ts` | Update action enum + listLanguages format |
| `src/tools/wb-entities.ts` | Add actions + richer listProperties format |
| `src/tools/wb-layers.ts` | Add actions to enum |
| `src/tools/wb-resources.ts` | Add browse action |
| `src/tools/wb-compile.ts` | **New file** |
| `src/server.ts` | Register wb_compile |
