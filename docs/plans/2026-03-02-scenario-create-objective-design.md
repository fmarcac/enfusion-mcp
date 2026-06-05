# Design: scenario_create_objective Tool

**Date:** 2026-03-02
**Status:** Approved

---

## Overview

A new MCP tool that places a complete Scenario Framework objective hierarchy into a live Workbench scene in a single call. Targets combat operations mission building: enemy AI that spawns when a task activates, with a surrounding trigger area.

---

## Approach

**Option A  -  Live Workbench entity placement** (selected)

Uses existing `wb_entity_create` + `wb_entity_modify` (setProperty / addArrayItem) tools to build the hierarchy live. No new Workbench scripts required.

Rejected alternatives:
- Option B (write .et prefab files directly)  -  bypasses Workbench live editing, no GUID assignment, harder to iterate.
- Option C (template .et + scene patch)  -  requires new Workbench script handlers, more complexity.

---

## Tool Interface

```
scenario_create_objective(
  taskType:      "kill" | "clearArea" | "destroy"
  taskName:      string          // used as entity name prefix + task title
  description:   string
  position:      "x y z"        // world position for the Area entity
  aiGroupPrefab: string          // prefab path for the AI group to spawn
  triggerRadius: number          // default 100, radius of the Area trigger
  faction?:      string          // optional faction key (e.g. "USSR")
  modName?:      string          // optional mod name for context
)
```

---

## Entity Hierarchy (kill type)

```
{taskName}_Area           (SCR_ScenarioFrameworkArea, at position)
└── {taskName}_LayerTask  (SCR_ScenarioFrameworkLayerTask  -  kill variant)
    └── {taskName}_Layer_AI
        ├── {taskName}_SlotKill  (SCR_ScenarioFrameworkSlotTask  -  references SlotAI name)
        └── {taskName}_SlotAI   (SCR_ScenarioFrameworkSlotAI  -  spawns aiGroupPrefab)
```

All entity names are derived automatically from `taskName` to avoid cross-reference errors.

---

## Property Wiring

| Entity | Property | Value |
|--------|----------|-------|
| Area | TriggerRadius | triggerRadius |
| Area | ActivationType | ON_TRIGGER_ACTIVATION |
| LayerTask | TaskTitle | taskName |
| LayerTask | TaskDescription | description |
| LayerTask | FactionKey | faction (if provided) |
| LayerTask | ActivationType | ON_INIT |
| SlotKill | ObjectToKill | {taskName}_SlotAI (entity name ref) |
| SlotAI | ObjectToSpawn | aiGroupPrefab |
| SlotAI | AISkill | NORMAL |

---

## Implementation Notes

- Uses existing wb_entity_create + wb_entity_modify tools exclusively  -  no new Workbench script handlers.
- Entity placement is sequential: Area → LayerTask → Layer_AI → SlotKill + SlotAI (parent must exist before child).
- Cross-references (SlotKill → SlotAI) use entity names, not GUIDs.
- `clearArea` and `destroy` task types follow the same hierarchy pattern with different slot types.
- Error handling: if any entity creation step fails, report which step failed and what was already placed so the user can clean up or retry.

---

## Success Criteria

- Single tool call places a working kill-task hierarchy in the scene.
- AI group spawns when the player enters the trigger area.
- Task completes when the AI group is eliminated.
- Works with the existing Scenario Framework debug tools (Task Inspector, Layer Inspector).
