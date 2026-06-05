# scenario_create_objective Implementation Plan

> **For client:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `scenario_create_objective` MCP tool that places a complete Scenario Framework objective hierarchy (Area → LayerTask → Layer_AI → SlotKill + SlotAI) in a live Workbench scene in a single call.

**Architecture:** Pure orchestration tool  -  no new Workbench scripts. Calls existing `wb_entity_create` and `wb_entity_modify` (setProperty / reparent) sequentially to build the hierarchy. Entity names are derived from `taskName` to keep cross-references deterministic.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, `zod`, `WorkbenchClient` (existing). No new dependencies.

---

## Key Facts (read before touching any code)

### Prefab paths (verified from game data)

| Entity | Prefab path |
|--------|-------------|
| Area | `{3AAECFCAE1BE0189}Prefabs/Systems/ScenarioFramework/Components/Area.et` |
| LayerTaskKill | `{5AF3BFDA2EAE56EA}Prefabs/Systems/ScenarioFramework/Components/LayerTaskKill.et` |
| LayerTaskDestroy | use `LayerTaskDestroy.et` same prefix |
| LayerTaskClearArea | use `LayerTaskClearArea.et` same prefix |
| Layer (generic) | `{3AAECFCAE1BE0189}Prefabs/Systems/ScenarioFramework/Components/Layer.et` |
| SlotKill | `{C70DC6CBD1AAEC9A}Prefabs/Systems/ScenarioFramework/Components/SlotKill.et` |
| SlotAI | `{8D43830F02C3F114}Prefabs/Systems/ScenarioFramework/Components/SlotAI.et` |
| SlotDestroy | `{7586595959BA2D99}Prefabs/ScenarioFramework/Components/SlotDestroy.et` |
| SlotClearArea | `{E53456990A756229}Prefabs/ScenarioFramework/Components/SlotClearArea.et` |

> **Note:** GUIDs above come from reading game .et files. The GUID prefix is what the Workbench resource manager uses; the path after `}` is the bare path. Use the full `{GUID}path` form with `wb_entity_create`.

### Entity hierarchy for `kill` type

```
{taskName}_Area             ← Area.et, at position, ActivationType = ON_TRIGGER_ACTIVATION
└── {taskName}_LayerTask    ← LayerTaskKill.et, child of Area
    └── {taskName}_Layer_AI ← Layer.et, child of LayerTask
        ├── {taskName}_SlotKill  ← SlotKill.et, child of Layer_AI
        └── {taskName}_SlotAI   ← SlotAI.et, child of Layer_AI
```

Parent-child relationships are set with `wb_entity_modify` action `reparent` after creation.

### Property wiring (component.property notation used by `setProperty`)

| Entity | propertyPath | Value |
|--------|-------------|-------|
| Area | `SCR_ScenarioFrameworkArea.m_eActivationType` | `ON_TRIGGER_ACTIVATION` |
| Area | `SCR_ScenarioFrameworkArea.m_fTriggerRadius` | triggerRadius as string |
| LayerTask | `SCR_ScenarioFrameworkLayerTaskKill.m_sTaskTitle` | taskName |
| LayerTask | `SCR_ScenarioFrameworkLayerTaskKill.m_sTaskDescription` | description |
| LayerTask | `SCR_ScenarioFrameworkLayerTaskKill.m_sFactionKey` | faction (if provided) |
| SlotKill | `SCR_ScenarioFrameworkSlotKill.m_sObjectToSpawn` | aiGroupPrefab |
| SlotAI | `SCR_ScenarioFrameworkSlotAI.m_sObjectToSpawn` | aiGroupPrefab |

### How `wb_entity_create` + `reparent` works

`wb_entity_create` places at world root. Then `wb_entity_modify` with `action: "reparent"` and `value: parentEntityName` moves it under the parent. Order matters: parent must exist before child.

### Registration pattern (how other tools are structured)

Every tool lives in `src/tools/wb-<name>.ts` and exports `registerXxx(server, client)`. It is imported and called in `src/server.ts` inside `registerTools()`.

---

## Task 1: Create the tool file skeleton

**Files:**
- Create: `src/tools/wb-scenario.ts`

**Step 1: Write the file with imports and an empty register function**

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { WorkbenchClient } from "../workbench/client.js";

export function registerScenarioTools(server: McpServer, client: WorkbenchClient): void {
  // tools registered below
}
```

**Step 2: Verify it compiles**

```
cd c:/Users/user/Documents/A_documents/Github/enfusion-mcp-BK
npm run build
```

Expected: build succeeds with no errors.

**Step 3: Commit**

```bash
git add src/tools/wb-scenario.ts
git commit -m "feat: add empty wb-scenario tool skeleton"
```

---

## Task 2: Register the tool in server.ts

**Files:**
- Modify: `src/server.ts`

**Step 1: Add import at top of server.ts (after the last wb-* import)**

```typescript
import { registerScenarioTools } from "./tools/wb-scenario.js";
```

**Step 2: Add registration call in `registerTools()` after `registerWbState`**

```typescript
registerScenarioTools(server, wbClient);
```

**Step 3: Build and verify**

```
npm run build
```

Expected: no errors.

**Step 4: Commit**

```bash
git add src/server.ts
git commit -m "feat: wire scenario tools into server registration"
```

---

## Task 3: Implement `scenario_create_objective`  -  input schema and helpers

**Files:**
- Modify: `src/tools/wb-scenario.ts`

**Step 1: Add the tool registration with full input schema inside `registerScenarioTools`**

```typescript
server.registerTool(
  "scenario_create_objective",
  {
    description:
      "Place a complete Scenario Framework objective hierarchy in the live Workbench scene. " +
      "Creates Area → LayerTask → Layer_AI → SlotKill + SlotAI entities and wires all cross-references. " +
      "Requires Workbench to be running with a world open. " +
      "Use for kill/clearArea/destroy tasks that spawn an AI group when a player enters the trigger area.",
    inputSchema: {
      taskType: z
        .enum(["kill", "clearArea", "destroy"])
        .describe("Objective type. Determines which LayerTask and Slot prefabs are used."),
      taskName: z
        .string()
        .describe(
          "Short identifier used as entity name prefix and task title (e.g. 'Eliminate_Patrol'). " +
          "No spaces  -  use underscores. All placed entity names derive from this."
        ),
      description: z
        .string()
        .describe("Task description shown to the player in the task list."),
      position: z
        .string()
        .describe("World position for the Area entity as 'x y z' (e.g. '1234 0 5678')."),
      aiGroupPrefab: z
        .string()
        .describe(
          "Prefab path for the AI group to spawn (e.g. '{GUID}Prefabs/Groups/OPFOR/Group_USSR_LightFireTeam.et'). " +
          "Use asset_search to find the GUID-prefixed path."
        ),
      triggerRadius: z
        .number()
        .default(100)
        .describe("Radius in metres of the Area trigger that activates the objective. Default 100."),
      faction: z
        .string()
        .optional()
        .describe("Faction key that owns this task (e.g. 'US', 'USSR'). Optional."),
    },
  },
  async ({ taskType, taskName, description, position, aiGroupPrefab, triggerRadius, faction }) => {
    // implementation added in Task 4
    return { content: [{ type: "text" as const, text: "Not yet implemented" }] };
  }
);
```

**Step 2: Add prefab map helpers above `registerScenarioTools`**

```typescript
const SF = "Prefabs/Systems/ScenarioFramework/Components";

const PREFABS: Record<string, Record<string, string>> = {
  kill: {
    layerTask: `{5AF3BFDA2EAE56EA}${SF}/LayerTaskKill.et`,
    slot:      `{C70DC6CBD1AAEC9A}${SF}/SlotKill.et`,
    slotComp:  "SCR_ScenarioFrameworkSlotKill",
    layerComp: "SCR_ScenarioFrameworkLayerTaskKill",
  },
  clearArea: {
    layerTask: `{775C493CE872C3A5}${SF}/LayerTaskClearArea.et`,
    slot:      `{E53456990A756229}${SF}/SlotClearArea.et`,
    slotComp:  "SCR_ScenarioFrameworkSlotClearArea",
    layerComp: "SCR_ScenarioFrameworkLayerTaskClearArea",
  },
  destroy: {
    layerTask: `{5AF3BFDA2EAE56EA}${SF}/LayerTaskDestroy.et`,
    slot:      `{7586595959BA2D99}${SF}/SlotDestroy.et`,
    slotComp:  "SCR_ScenarioFrameworkSlotDestroy",
    layerComp: "SCR_ScenarioFrameworkLayerTaskDestroy",
  },
};

const AREA_PREFAB  = `{3AAECFCAE1BE0189}${SF}/Area.et`;
const LAYER_PREFAB = `{3AAECFCAE1BE0189}${SF}/Layer.et`;
const SLOT_AI_PREFAB = `{8D43830F02C3F114}${SF}/SlotAI.et`;
```

> **Note on GUIDs:** These GUIDs were read from the game's .et files in the pak archive. If `wb_entity_create` fails with "prefab not found", try without the GUID prefix (bare path). The tool should surface the error message clearly so the user can see which step failed.

**Step 3: Build**

```
npm run build
```

Expected: no errors.

**Step 4: Commit**

```bash
git add src/tools/wb-scenario.ts
git commit -m "feat: add scenario_create_objective schema and prefab map"
```

---

## Task 4: Implement the entity placement logic

**Files:**
- Modify: `src/tools/wb-scenario.ts`  -  replace the stub `async` handler body

**Step 1: Replace the stub handler body with the full placement sequence**

The logic is a sequential pipeline. Each step calls the Workbench client. If any step fails, return an error immediately listing which entities were already placed (so the user can clean them up).

```typescript
async ({ taskType, taskName, description, position, aiGroupPrefab, triggerRadius, faction }) => {
  const p = PREFABS[taskType];
  const names = {
    area:      `${taskName}_Area`,
    layerTask: `${taskName}_LayerTask`,
    layerAI:   `${taskName}_Layer_AI`,
    slot:      `${taskName}_Slot`,
    slotAI:    `${taskName}_SlotAI`,
  };
  const placed: string[] = [];

  // Helper: call client and throw with context on failure
  async function wb<T extends Record<string, unknown>>(handler: string, params: Record<string, unknown>): Promise<T> {
    return client.call<T>(handler, params);
  }

  try {
    // 1. Place Area at position
    await wb("EMCP_WB_CreateEntity", { prefab: AREA_PREFAB, name: names.area, position });
    placed.push(names.area);

    // 2. Place LayerTask (world root, then reparent)
    await wb("EMCP_WB_CreateEntity", { prefab: p.layerTask, name: names.layerTask });
    placed.push(names.layerTask);
    await wb("EMCP_WB_ModifyEntity", { action: "reparent", name: names.layerTask, value: names.area });

    // 3. Place Layer_AI (world root, then reparent under LayerTask)
    await wb("EMCP_WB_CreateEntity", { prefab: LAYER_PREFAB, name: names.layerAI });
    placed.push(names.layerAI);
    await wb("EMCP_WB_ModifyEntity", { action: "reparent", name: names.layerAI, value: names.layerTask });

    // 4. Place Slot (SlotKill/SlotDestroy/SlotClearArea) under Layer_AI
    await wb("EMCP_WB_CreateEntity", { prefab: p.slot, name: names.slot });
    placed.push(names.slot);
    await wb("EMCP_WB_ModifyEntity", { action: "reparent", name: names.slot, value: names.layerAI });

    // 5. Place SlotAI under Layer_AI
    await wb("EMCP_WB_CreateEntity", { prefab: SLOT_AI_PREFAB, name: names.slotAI });
    placed.push(names.slotAI);
    await wb("EMCP_WB_ModifyEntity", { action: "reparent", name: names.slotAI, value: names.layerAI });

    // 6. Wire properties  -  Area trigger
    await wb("EMCP_WB_ModifyEntity", {
      action: "setProperty", name: names.area,
      propertyPath: "SCR_ScenarioFrameworkArea.m_eActivationType", value: "ON_TRIGGER_ACTIVATION",
    });
    await wb("EMCP_WB_ModifyEntity", {
      action: "setProperty", name: names.area,
      propertyPath: "SCR_ScenarioFrameworkArea.m_fTriggerRadius", value: String(triggerRadius),
    });

    // 7. Wire properties  -  LayerTask title/description/faction
    await wb("EMCP_WB_ModifyEntity", {
      action: "setProperty", name: names.layerTask,
      propertyPath: `${p.layerComp}.m_sTaskTitle`, value: taskName,
    });
    await wb("EMCP_WB_ModifyEntity", {
      action: "setProperty", name: names.layerTask,
      propertyPath: `${p.layerComp}.m_sTaskDescription`, value: description,
    });
    if (faction) {
      await wb("EMCP_WB_ModifyEntity", {
        action: "setProperty", name: names.layerTask,
        propertyPath: `${p.layerComp}.m_sFactionKey`, value: faction,
      });
    }

    // 8. Wire Slot  -  what to spawn / kill
    await wb("EMCP_WB_ModifyEntity", {
      action: "setProperty", name: names.slot,
      propertyPath: `${p.slotComp}.m_sObjectToSpawn`, value: aiGroupPrefab,
    });

    // 9. Wire SlotAI  -  group to spawn
    await wb("EMCP_WB_ModifyEntity", {
      action: "setProperty", name: names.slotAI,
      propertyPath: "SCR_ScenarioFrameworkSlotAI.m_sObjectToSpawn", value: aiGroupPrefab,
    });

    return {
      content: [{
        type: "text" as const,
        text: [
          `**Objective created: ${taskName}**`,
          ``,
          `Entities placed:`,
          ...placed.map(n => `  - ${n}`),
          ``,
          `Task type: ${taskType}`,
          `Position: ${position}`,
          `Trigger radius: ${triggerRadius}m`,
          `AI group: ${aiGroupPrefab}`,
          faction ? `Faction: ${faction}` : "",
          ``,
          `Next steps:`,
          `1. In Workbench, verify the hierarchy under ${names.area}.`,
          `2. Add more SlotAI entities under ${names.layerAI} for additional spawn points.`,
          `3. Use wb_entity_modify setProperty to adjust activation conditions or faction filters.`,
          `4. Save the world.`,
        ].filter(l => l !== "").join("\n"),
      }],
    };

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      content: [{
        type: "text" as const,
        text: [
          `**scenario_create_objective failed**`,
          `Error: ${msg}`,
          ``,
          placed.length > 0
            ? `Entities already placed (clean up manually or delete them):\n${placed.map(n => `  - ${n}`).join("\n")}`
            : "No entities were placed.",
        ].join("\n"),
      }],
    };
  }
}
```

**Step 2: Build**

```
npm run build
```

Expected: no errors.

**Step 3: Commit**

```bash
git add src/tools/wb-scenario.ts
git commit -m "feat: implement scenario_create_objective entity placement"
```

---

## Task 5: Manual smoke test in Workbench

**Prerequisites:** Workbench must be running with a world open.

**Step 1: Rebuild and restart client Desktop** so the updated `dist/index.js` is loaded by the MCP server.

**Step 2: Run the tool via client** with a test call:

```
scenario_create_objective(
  taskType: "kill"
  taskName: "Test_Kill_01"
  description: "Eliminate the enemy patrol"
  position: "0 0 0"
  aiGroupPrefab: "{657590C1EC9E27D3}Prefabs/Groups/OPFOR/Group_USSR_LightFireTeam.et"
  triggerRadius: 100
)
```

**Step 3: Verify in Workbench World Editor**

- Check entity hierarchy: `Test_Kill_01_Area` → `Test_Kill_01_LayerTask` → `Test_Kill_01_Layer_AI` → `Test_Kill_01_Slot` + `Test_Kill_01_SlotAI`
- Check `SCR_ScenarioFrameworkArea.m_eActivationType` = `ON_TRIGGER_ACTIVATION`
- Check `SCR_ScenarioFrameworkArea.m_fTriggerRadius` = `100`
- Check task title and description on `Test_Kill_01_LayerTask`
- Check `m_sObjectToSpawn` on both `Test_Kill_01_Slot` and `Test_Kill_01_SlotAI`

**Step 4: If property names are wrong**

Use `wb_entity_modify listProperties` on each entity to discover the actual property names the Workbench exposes, then update the `propertyPath` strings in the handler.

---

## Task 6: Fix property paths if needed and update GUIDs

**Context:** The GUIDs in `PREFABS` and `AREA_PREFAB` etc. were read from `.pak` archives. Some may differ from what the Workbench resource manager resolves at runtime (the `.meta` GUID may differ from the embedded `ID` field in the `.et` file). If `wb_entity_create` fails with "prefab not found":

**Step 1: Use `wb_prefabs getGuid` to look up the correct GUID**

```
wb_prefabs(action: "getGuid", path: "Prefabs/Systems/ScenarioFramework/Components/Area.et")
```

**Step 2: Update the GUID prefix in `PREFABS` / `AREA_PREFAB` constants**

**Step 3: Rebuild, retest**

---

## Task 7: Version bump and release

**Files:**
- Modify: `package.json`  -  bump version to `0.7.0`

**Step 1: Update version**

```bash
cd c:/Users/user/Documents/A_documents/Github/enfusion-mcp-BK
# edit package.json: "version": "0.7.0"
```

**Step 2: Build final**

```
npm run build
```

**Step 3: Commit and tag**

```bash
git add package.json
git commit -m "chore(release): v0.7.0"
git tag v0.7.0
git push && git push --tags
```

---

## Known Risks

| Risk | Mitigation |
|------|-----------|
| GUID prefix in PREFABS wrong | Use `wb_prefabs getGuid` (Task 6) to look up correct runtime GUID |
| `reparent` not supported for SF entities | Check `wb_entity_modify listProperties`  -  if reparent fails, place entities directly with `layerPath` param in `wb_entity_create` instead |
| Property path format wrong | Use `wb_entity_modify listProperties` on placed entity to discover actual exposed paths |
| Area trigger radius property name differs | Check SlotAI.et  -  field is `m_fAreaRadius` on plugin, not directly on area; may need `addArrayItem` to add a plugin first |
