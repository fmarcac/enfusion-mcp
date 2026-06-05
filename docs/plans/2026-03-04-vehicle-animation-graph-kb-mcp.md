# Vehicle Animation Graph Knowledge Base + MCP Tools  -  Implementation Plan

> **For client:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a comprehensive vehicle animation graph knowledge base in the arma-knowledge patterns folder and add three MCP tools (`animation_graph_inspect`, `animation_graph_author`, `animation_graph_setup`) to the enfusion-mcp server.

**Architecture:** Knowledge base lives at `C:\Users\user\.mcp\arma-knowledge\patterns\Character_And_Animation\animation\` as six focused Markdown files. MCP tools live in `src/tools/animation-graph-*.ts` and are registered in `src/server.ts`. Tools parse Enfusion text serialization format directly  -  no Workbench connection required.

**Tech Stack:** TypeScript, Node.js, Zod (already used throughout codebase). Source data: LAV25/S105 `.agr`/`.agf`/`.ast` files in `E:\Arma reforger data\Data004\Assets\Vehicles\Wheeled\`. Teaching guides in `C:\Users\user\Documents\A_documents\Arma_Reforger_RAG_Hybrid_Optimized\Documentation\Character_And_Animation\`.

---

## Context You Need

### Key paths
- Knowledge base root: `C:/Users/user/.mcp/arma-knowledge/`
- Main INDEX: `C:/Users/user/.mcp/arma-knowledge/INDEX.md`
- Old animation file to delete: `C:/Users/user/.mcp/arma-knowledge/patterns/Character_And_Animation/animation-graph.md`
- New animation subfolder: `C:/Users/user/.mcp/arma-knowledge/patterns/Character_And_Animation/animation/`
- MCP repo root: `C:/Users/user/Documents/A_documents/Github/enfusion-mcp-BK/`
- MCP tools dir: `C:/Users/user/Documents/A_documents/Github/enfusion-mcp-BK/src/tools/`
- MCP server registration: `C:/Users/user/Documents/A_documents/Github/enfusion-mcp-BK/src/server.ts`

### Source files to distill
- `C:/Users/user/Documents/A_documents/Arma_Reforger_RAG_Hybrid_Optimized/Documentation/Character_And_Animation/Arma_Reforger_Animation_Nodes_Teaching_Guide.md` (1392 lines)  -  AGF nodes
- `C:/Users/user/Documents/A_documents/Arma_Reforger_RAG_Hybrid_Optimized/Documentation/Character_And_Animation/Arma_Reforger_Procedural_Animation_Nodes_Teaching_Guide.md` (1229 lines)  -  PAP/SIGA nodes
- `E:/Arma reforger data/Data004/Assets/Vehicles/Wheeled/LAV25/workspaces/LAV25.agr`  -  complex vehicle AGR
- `E:/Arma reforger data/Data004/Assets/Vehicles/Wheeled/LAV25/workspaces/LAV25.agf`  -  complex vehicle AGF
- `E:/Arma reforger data/Data004/Assets/Vehicles/Wheeled/LAV25/workspaces/LAV25.ast`  -  complex vehicle AST
- `E:/Arma reforger data/Data004/Assets/Vehicles/Wheeled/S105/workspace/S105.agr`  -  simple vehicle AGR
- `E:/Arma reforger data/Data004/Assets/Vehicles/Wheeled/S105/workspace/S105.agf`  -  simple vehicle AGF
- `E:/Arma reforger data/Data004/Assets/Vehicles/Wheeled/S105/workspace/S105.ast`  -  simple vehicle AST

### Enfusion text serialization format (for parser)
Files use a brace-block format:
```
TypeName OptionalName {
  Property value
  NestedType Name {
    Property value
  }
}
```
String values are quoted. Arrays are bare `{ "item1" "item2" }` or typed object blocks.

### MCP tool pattern (TypeScript)
```typescript
// src/tools/my-tool.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config } from "../config.js";

export function registerMyTool(server: McpServer, config: Config): void {
  server.registerTool(
    "tool_name",
    {
      description: "...",
      inputSchema: {
        param: z.string().describe("..."),
        optParam: z.boolean().optional().default(false).describe("..."),
      },
    },
    async ({ param, optParam }) => {
      // implementation
      return {
        content: [{ type: "text", text: "result" }],
      };
    }
  );
}
```

Registration in `src/server.ts`:
```typescript
import { registerMyTool } from "./tools/my-tool.js";
// inside registerTools():
registerMyTool(server, config);
```

---

## Task 1: Write `animation/INDEX.md`

**Files:**
- Create: `C:/Users/user/.mcp/arma-knowledge/patterns/Character_And_Animation/animation/INDEX.md`

**Step 1: Create the routing index**

Write a task-to-file routing table. Content:

```markdown
# Animation Graph  -  Local Index

Read this first. Find your task below and read only the listed file(s).

| Task | Read |
|---|---|
| Setting up a new vehicle animation graph from scratch | `core-concepts.md` + `vehicle-animation.md` |
| Understanding a specific AGF node type | `node-reference.md` |
| Reading or modifying an existing vehicle AGF/AGR | `core-concepts.md` + `node-reference.md` + `vehicle-animation.md` |
| Driving animation variables from EnforceScript | `script-integration.md` |
| Working with a legacy PAP/SIGA vehicle | `procedural-pap-siga.md` |
| Full animation system overview | All files |

## File Summaries

| File | Contents |
|---|---|
| `core-concepts.md` | All animation file types, two-phase eval model, AGR vs AGF responsibilities, editor rules |
| `node-reference.md` | Every AGF node type  -  purpose, properties, usage, gotchas |
| `vehicle-animation.md` | Vehicle variables, IK chains, bone masks, node patterns, step-by-step setup, S105 + LAV25 examples |
| `procedural-pap-siga.md` | Legacy PAP/SIGA system  -  all node types, data flow, pitfalls |
| `script-integration.md` | AnimationControllerComponent API, driving graph vars from script, replication rules |
```

**Step 2: Commit**
```bash
cd "C:/Users/user/.mcp/arma-knowledge"
git add patterns/Character_And_Animation/animation/INDEX.md
git commit -m "feat: add animation subfolder index"
```

---

## Task 2: Write `animation/core-concepts.md`

**Files:**
- Read first: `C:/Users/user/Documents/A_documents/Arma_Reforger_RAG_Hybrid_Optimized/Documentation/Character_And_Animation/Arma_Reforger_Animation_Nodes_Teaching_Guide.md` (sections 1-4)
- Read first: `C:/Users/user/.mcp/arma-knowledge/patterns/Character_And_Animation/animation-graph.md` (existing content to migrate)
- Create: `C:/Users/user/.mcp/arma-knowledge/patterns/Character_And_Animation/animation/core-concepts.md`

**Step 1: Read source material**

Read the teaching guide sections 1-4 (Foundational Concepts, Graph Evaluation, Time and Timing, Common Properties) and the existing animation-graph.md.

**Step 2: Write the file**

The file must cover ALL of these sections  -  distill from source, do not just summarize vaguely:

- **File types table**  -  every extension: `.agr`, `.agf`, `.ast`, `.asi`, `.anm`, `.txa`, `.aw`, `.pap`, `.siga`, `.ae`, `.asy`, `.adeb`  -  column: extension | purpose | editor | depends on
- **AGR vs AGF responsibilities**  -  AGR: variables, IK chains, bone masks, commands, GlobalTags, DefaultRunNode, AGF file references. AGF: node graph sheets, actual node hierarchy. Rule: AGR survives file edits. AGF is wiped by Workbench on open  -  NEVER edit AGF by hand.
- **Two-phase evaluation model**  -  DOWN phase (master→leaf, selects branches), UP phase (leaf→master, poses bubble up). Logic flows top-to-bottom. Poses flow bottom-to-top. Tags/remaining-time/events only valid after UP phase  -  use PostEval flag.
- **Real time vs normal time**  -  Real Time = wall clock seconds. Normal Time = animation-relative 0-1. Specify `TimeStorage "Real Time"` on TimeScale/TimeSave nodes when you need wall clock.
- **Common node properties**  -  Name (unique within sheet), EditorPos (x y layout hint, ignored at runtime), Child (single child reference), all nodes can have these.
- **Critical editor rules**  -  list of do/don't rules derived from experience

**Step 3: Commit**
```bash
cd "C:/Users/user/.mcp/arma-knowledge"
git add patterns/Character_And_Animation/animation/core-concepts.md
git commit -m "feat: add animation core-concepts"
```

---

## Task 3: Write `animation/node-reference.md`

**Files:**
- Read first: `C:/Users/user/Documents/A_documents/Arma_Reforger_RAG_Hybrid_Optimized/Documentation/Character_And_Animation/Arma_Reforger_Animation_Nodes_Teaching_Guide.md` (sections 5-9  -  the full node reference)
- Create: `C:/Users/user/.mcp/arma-knowledge/patterns/Character_And_Animation/animation/node-reference.md`

**Step 1: Read source material**

Read the full teaching guide. Focus on section 5 (all node types), section 6 (event system), section 7 (IK solvers), section 8 (constraints), section 9 (VarSet item types).

**Step 2: Write the file**

For each node type include: **Purpose** (one line), **Key properties** (name + what it does), **Usage pattern** (when to use it), **Gotchas** (pitfalls). Cover ALL of these in order:

- Attachment
- Blend, BlendN, BlendT, BlendTAdd, BlendTW  -  include blend weight expressions
- Queue  -  EnqueueMethod values (Replace/Add/Ignore), StartExpr/StopExpr, BlendInTime/BlendOutTime
- Switch  -  Condition-based child routing
- BufferSave, BufferUse  -  pose buffer system, use case (turret body decoupling)
- Filter  -  bone mask filtering
- CtxBegin, CtxEnd  -  context scoping
- AnimSrcEventGeneric, AnimSrcEventAudio  -  event properties, timing
- FunctionBegin, FunctionCall, FunctionEnd  -  reusable subgraph pattern
- Group Select  -  animation set group switching
- IK2, IK2Plane, IK2Target, IKLock, IKRotation  -  IK application nodes
- IK solvers: FabrikSolver, TwoBoneSolver, LookAtSolver, LookInDirSolver, PoleSolver  -  solver type properties
- RBF  -  radial basis function blending
- WeaponIK  -  weapon hand IK
- Memory  -  pose memory/snapshot
- Constraint, AnimSrcConstraintPosition, AnimSrcConstraintParent  -  constraint types
- AnimNodeProcTransform (Procedural)  -  Bone/Op/Space/Amount/Expression, NO $Time variable
- Sleep  -  AwakeExpr, Timeout  -  performance node
- BindPose, Pose, Pose2, Source, SourceInLoopOut, SourceSync  -  source node family
  - Source: `Source "Group.AnimName"` format (no column in AGF, unlike ASI)
  - Pose: frame sampling by expression (0=first, 1=last)
  - SourceSync: synchronized playback across instances
- State, StateMachine  -  Condition/Duration/Priority/PostEval on transitions
- Tag  -  tagging system, use with PostEval
- TimeSave, TimeScale, TimeUse  -  time sharing across subtrees
- VarReset, VarSet, VarUpdate  -  variable manipulation, MaxDifferencePerSecond on VarUpdate
- VarSet item types (section 9 of teaching guide)

**Step 3: Commit**
```bash
cd "C:/Users/user/.mcp/arma-knowledge"
git add patterns/Character_And_Animation/animation/node-reference.md
git commit -m "feat: add animation node-reference"
```

---

## Task 4: Write `animation/vehicle-animation.md`

**Files:**
- Read first: `E:/Arma reforger data/Data004/Assets/Vehicles/Wheeled/LAV25/workspaces/LAV25.agr`
- Read first: `E:/Arma reforger data/Data004/Assets/Vehicles/Wheeled/LAV25/workspaces/LAV25.ast`
- Read first: `E:/Arma reforger data/Data004/Assets/Vehicles/Wheeled/S105/workspace/S105.agr`
- Read first: `E:/Arma reforger data/Data004/Assets/Vehicles/Wheeled/S105/workspace/S105.ast`
- Read first (first 200 lines): `E:/Arma reforger data/Data004/Assets/Vehicles/Wheeled/S105/workspace/S105.agf`
- Create: `C:/Users/user/.mcp/arma-knowledge/patterns/Character_And_Animation/animation/vehicle-animation.md`

**Step 1: Read all source files above**

**Step 2: Write the file**

Must cover ALL of the following  -  extract exact data from the source files, do not invent:

**Standard Variable Set**
Table with columns: Variable name | Type | Min | Max | Default | Purpose. Extract every variable from LAV25.agr. Group by category:
- Wheel variables: `wheel_0` through `wheel_7` (Float, -360 to 360)  -  wheel rotation angle
- Suspension variables: `suspension_0` through `suspension_7` (Float, -1 to 1)  -  suspension travel
- Steering: `steering`, `steering_axle2`, `steering_delay` (Float, -50 to 50)
- Vehicle dynamics: `VehicleSteering`, `VehicleThrottle`, `VehicleClutch`, `VehicleBrake`, `VehicleHandBrake`, `VehicleAccelerationFB`, `VehicleAccelerationLR`, `SPEED`, `Speed_dumping`, `Speed_dumping2`, `Gearbox_RPM`, `Engine_RPM`
- Body motion: `SpineAccelerationFB`, `SpineAccelerationLR`, `Vehicle_Wobble`, `Suspension_dumping`, `Suspension_shake`, `YawAngle`, `Yaw`, `Yaw_SimComp`, `Pitch`, `Pitch_SimComp`
- Crew/seat: `LookX`, `LookY`, `AimX`, `AimY`, `SeatPositionType`, `IsDriver`, `IsInVehicle`, `TurnOut`, `Horn`
- Turret: `TurretRot_Antennas`, `Gunner_sights_cover`, `Gunner_comander_cover`
- Amphibious: `WaterLevel`, `IsSwimming`, `IsSwimming_delayed2`
- Gauges/misc: `FUEL1`, `POWER_IO`, `Dial_random`, `LocalTime`
- Speed antenna variables: `speed_ant1`, `speed_ant2`
- Door state: `VehicleDoorState`, `VehicleDoorType`

**Standard Commands**
List all commands from LAV25.agr with purpose annotations.

**Standard IK Chain Patterns**
Show the Enfusion text format for:
- Character limb chains (LeftLeg/RightLeg/LeftArm/RightArm)  -  include Joints array, MiddleJoint, ChainAxis values
- Single-bone vehicle chains (suspension_0 through suspension_7, shock_absorber_N, steering_axis_suspension_N, steering_axis_body_N, shaft_up_N, etc.)  -  extract real names from LAV25.agr
- Multi-bone IK chains (Visor_cover_arm_L/R example from LAV25)

**Standard Bone Mask Structure**
Show Chassis / Body / Turret / Turret_Pose bone masks with real bone name examples from LAV25.

**Node Hierarchy Patterns**  -  for each pattern show the AGF node type + key properties:

1. **Wheel rotation**  -  ProcTransform node: Bone=`v_wheel_LNN`, Op=Rotate, Space=Local, Amount=`wheel_N` variable expression
2. **Suspension travel**  -  IK2Target (sets target position from suspension_N) → IK2 (applies IK to suspension bone chain)
3. **Steering linkage**  -  ProcTransform on steering axis bones driven by `steering` variable
4. **Dial/gauge**  -  Pose node: Source=`Group.Column.AnimName`, Expression=`varName` (maps 0-1 to first-last frame)
5. **Turret rotation**  -  ProcTransform on `v_turret_01` bone driven by `YawAngle`
6. **Character seat state machine**  -  StateMachine with State nodes per SeatPositionType value, Queue on top for action interrupts, IK2+IK2Target for hand placement on controls
7. **Suspension shake/damping**  -  VarUpdate rate-limiting → TimeScale feeding into Source playback speed
8. **Sleep optimization**  -  Sleep node near top of each major branch, AwakeExpr based on IsInVehicle or IsDriver

**Step-by-step: New Wheeled Vehicle AGR Setup**
1. Decide wheel count (determines variable count)
2. Decide feature flags: hasTurret, hasSuspensionIK, hasShockAbsorbers, hasSteeringLinkage, seatTypes, dialList
3. Write AGR Variables block (use standard variable set, omit unused)
4. Write AGR Commands block (use standard commands)
5. Write AGR IkChains block (character limbs always present; vehicle mechanical chains per feature)
6. Write AGR BoneMasks block (Chassis, Body, Turret if applicable)
7. Set GlobalTags: `"VEHICLE"`, `"WHEELED"`, `"VEHICLENAME"`
8. Set DefaultRunNode to `"MasterControl"` (name your master Queue node this)
9. Create matching AST with animation groups for each seat type
10. Open in Workbench, build AGF node graph following patterns above
11. Set AGR reference: `GraphFilesResourceNames { "path/to/Vehicle.agf" }`

**Annotated S105 Example**  -  paste key AGR sections with inline comments explaining each part

**Annotated LAV25 Example**  -  paste key AGR sections (variables, IK chains, bone masks) with inline comments

**Common Pitfalls**
- Missing `v_` prefix on vehicle bone names  -  IK chains silently fail
- Wrong ChainAxis: LeftLeg uses `"+y"`, RightLeg uses `"-y"`  -  mixing these breaks IK
- IK chain joint order must go proximal → distal (hip to foot, shoulder to hand)
- Variable range mismatch: if wheel_N max is 360 but actual rotation exceeds it, animation clamps
- Dial Expression must map to 0-1 range  -  use `clamp(varName/maxVal, 0, 1)`
- DefaultRunNode name in AGR must EXACTLY match the Queue node name in AGF
- AGF file path in `GraphFilesResourceNames` must use GUID-prefixed format after registration

**Step 3: Commit**
```bash
cd "C:/Users/user/.mcp/arma-knowledge"
git add patterns/Character_And_Animation/animation/vehicle-animation.md
git commit -m "feat: add vehicle-animation patterns"
```

---

## Task 5: Write `animation/procedural-pap-siga.md`

**Files:**
- Read first: `C:/Users/user/Documents/A_documents/Arma_Reforger_RAG_Hybrid_Optimized/Documentation/Character_And_Animation/Arma_Reforger_Procedural_Animation_Nodes_Teaching_Guide.md` (full file)
- Read first: existing `C:/Users/user/.mcp/arma-knowledge/patterns/Character_And_Animation/animation-graph.md` (PAP/SIGA section)
- Create: `C:/Users/user/.mcp/arma-knowledge/patterns/Character_And_Animation/animation/procedural-pap-siga.md`

**Step 1: Read source material**

**Step 2: Write the file**

Structure:

```
## LEGACY WARNING
PAP/SIGA is being phased out. Use AGF/AGR for all new work.
Still needed for: reading/modifying existing base game assets that use .pap files.

## System Overview
- .pap = Procedural Animation Project (bone transforms)
- .siga = Signal Graph (math processing)
- Data flow: [diagram]
- ProcAnimComponent prefab setup

## Critical Rules
- Signal node Name in .pap MUST exactly match Output node Name in .siga
- Input node Name must exactly match engine-side identifier
- Update collider OFF by default on RotationSet/TranslateSet

## PAP Nodes (full reference)
[all nodes from teaching guide sections 2]

## SIGA Nodes (full reference)
[sections 3-8 of teaching guide: Input/Output/Value/Random/Generator, all math/conversion/shaping/rounding/trig nodes]

## Interpolation Curve Types
[section 9]

## Key Patterns
[section 10]
```

Distill all node types with: purpose, key properties, gotchas. Do not omit any node listed in the teaching guide.

**Step 3: Commit**
```bash
cd "C:/Users/user/.mcp/arma-knowledge"
git add patterns/Character_And_Animation/animation/procedural-pap-siga.md
git commit -m "feat: add procedural-pap-siga patterns"
```

---

## Task 6: Write `animation/script-integration.md`

**Files:**
- Read first: existing `C:/Users/user/.mcp/arma-knowledge/patterns/Character_And_Animation/animation-graph.md` (script-driven float section)
- Create: `C:/Users/user/.mcp/arma-knowledge/patterns/Character_And_Animation/animation/script-integration.md`

**Step 1: Write the file**

Must cover:

**AnimationControllerComponent API**
- `BindFloatVariable(string name) → int id`  -  call once in OnPostInit, cache the id
- `SetFloatVariable(int id, float value)`  -  call in EOnFrame with cached id
- `BindIntVariable` / `SetIntVariable`  -  same pattern for int vars
- `BindBoolVariable` / `SetBoolVariable`

**Correct Lifecycle**
```c
protected int m_iVarId = -1;

override protected void OnPostInit(IEntity owner)
{
    super.OnPostInit(owner);
    AnimationControllerComponent anim = AnimationControllerComponent.Cast(
        owner.FindComponent(AnimationControllerComponent));
    if (anim)
        m_iVarId = anim.BindFloatVariable("wheel_0");
    SetEventMask(owner, EntityEvent.FRAME);
}

override protected void EOnFrame(IEntity owner, float timeSlice)
{
    if (m_iVarId < 0) return;
    AnimationControllerComponent anim = AnimationControllerComponent.Cast(
        owner.FindComponent(AnimationControllerComponent));
    if (anim)
        anim.SetFloatVariable(m_iVarId, m_fWheelAngle);
}
```

**VehicleAnimationComponent vs BaseItemAnimationComponent**
- VehicleAnimationComponent: used on vehicles  -  automatically feeds standard vehicle variables (wheel_N, suspension_N, steering, Engine_RPM, etc.) from the physics simulation. You do NOT need script to drive these  -  the component does it.
- BaseItemAnimationComponent: used on items/props  -  no automatic variable feeding. You drive all vars from script.
- AlwaysActive flag: set to 1 when entity has no character occupant but needs animation (e.g. props, always-spinning fans)

**Replication Rule**
Animation variables are evaluated client-side. Never replicate animation state variables  -  instead replicate the underlying data (speed, RPM, etc.) and let each client compute animation vars locally.

**Driving Suspension from Physics**
Note that VehicleAnimationComponent handles suspension_N automatically via the physics system  -  no script needed. Only override if you need custom suspension behavior.

**Script-Driven Continuous Rotation** (full working example  -  e.g. fan, radar dish)

**Step 2: Commit**
```bash
cd "C:/Users/user/.mcp/arma-knowledge"
git add patterns/Character_And_Animation/animation/script-integration.md
git commit -m "feat: add script-integration patterns"
```

---

## Task 7: Update Main INDEX.md and Delete Old File

**Files:**
- Modify: `C:/Users/user/.mcp/arma-knowledge/INDEX.md`
- Delete: `C:/Users/user/.mcp/arma-knowledge/patterns/Character_And_Animation/animation-graph.md`

**Step 1: Read the main INDEX.md**

**Step 2: Replace the animation-graph.md row**

Find the row:
```
| [animation-graph.md](patterns/Character_And_Animation/animation-graph.md) | AGR/AGF/AST/ASI/ANM/TXA file types, Source node syntax, ProcTransform limits, tumbling projectile pattern, script-driven float accumulator |
```

Replace with:
```
| [animation/INDEX.md](patterns/Character_And_Animation/animation/INDEX.md) | Full animation graph system  -  AGF nodes, vehicle animation, PAP/SIGA, script integration. See local index for task routing. |
```

**Step 3: Delete old file**
```bash
rm "C:/Users/user/.mcp/arma-knowledge/patterns/Character_And_Animation/animation-graph.md"
```

**Step 4: Commit**
```bash
cd "C:/Users/user/.mcp/arma-knowledge"
git add -A
git commit -m "refactor: replace animation-graph.md with animation/ subfolder"
```

---

## Task 8: Implement `animation_graph_inspect` Tool

**Files:**
- Create: `C:/Users/user/Documents/A_documents/Github/enfusion-mcp-BK/src/tools/animation-graph-inspect.ts`
- Modify: `C:/Users/user/Documents/A_documents/Github/enfusion-mcp-BK/src/server.ts`

**Step 1: Read reference tools**

Read `src/tools/game-read.ts` and `src/tools/project-read.ts` to understand how to read files from both game data and project.

**Step 2: Write the parser utility inline in the tool file**

The Enfusion text format parser needs to extract:

For `.agr` files:
- All `AnimSrcGCTVarFloat/Int/Bool` entries → name + MinValue + MaxValue + DefaultValue
- All `AnimSrcGCTCmd` entries → name only
- All `AnimSrcGCTIkChain` entries → name + Joints array + MiddleJoint + ChainAxis
- All `AnimSrcGCTBoneMask` entries → name + bone count
- `GlobalTags` array
- `DefaultRunNode` value
- `GraphFilesResourceNames` array

For `.agf` files:
- All `AnimSrcGraphSheet` names
- Per sheet: all node names + node types (e.g. `AnimSrcNodeQueue`, `AnimSrcNodeSource`, etc.) + Child reference

For `.ast` files:
- All `AnimSetTemplateSource_AnimationGroup` entries → Name + Animations array + Columns array

Use regex-based extraction (no full parser needed  -  files are regular enough):
```typescript
// Extract typed blocks: match "TypeName Name {" patterns
function extractBlocks(text: string, typeName: string): Array<{name: string, body: string}> { ... }

// Extract simple property: match "PropertyName value" or "PropertyName \"value\""
function extractProp(body: string, propName: string): string | null { ... }

// Extract string array block: match "PropName { \"a\" \"b\" }"
function extractStringArray(body: string, propName: string): string[] { ... }
```

**Step 3: Write the tool**

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import type { Config } from "../config.js";
import { validateProjectPath } from "../utils/safe-path.js";
import { PakVirtualFS } from "../pak/vfs.js";

// [parser functions]

export function registerAnimationGraphInspect(server: McpServer, config: Config): void {
  server.registerTool(
    "animation_graph_inspect",
    {
      description:
        "Read and summarize an Arma Reforger animation graph file (.agr, .agf, or .ast). " +
        "Returns structured info: variables, IK chains, bone masks, commands, node types. " +
        "Use to audit an existing vehicle animation graph before modifying it. " +
        "Trigger phrases: 'what variables does X use', 'inspect animation graph', 'read AGR/AGF/AST'.",
      inputSchema: {
        path: z.string().describe(
          "File path to .agr, .agf, or .ast. Relative to mod project (source=mod) or game data (source=game)."
        ),
        source: z.enum(["mod", "game"]).default("mod").describe(
          "Whether to read from the mod project directory or base game data."
        ),
        projectPath: z.string().optional().describe(
          "Mod project root. Uses configured default if omitted."
        ),
      },
    },
    async ({ path: filePath, source, projectPath }) => {
      // [implementation: read file, detect extension, parse, return summary]
    }
  );
}
```

**Step 4: Register in server.ts**

Add to `src/server.ts`:
```typescript
import { registerAnimationGraphInspect } from "./tools/animation-graph-inspect.js";
// in registerTools():
registerAnimationGraphInspect(server, config);
```

**Step 5: Build and verify no TypeScript errors**
```bash
cd "C:/Users/user/Documents/A_documents/Github/enfusion-mcp-BK"
npm run build 2>&1
```
Expected: no errors.

**Step 6: Commit**
```bash
git add src/tools/animation-graph-inspect.ts src/server.ts
git commit -m "feat: add animation_graph_inspect tool"
```

---

## Task 9: Implement `animation_graph_author` Tool

**Files:**
- Create: `C:/Users/user/Documents/A_documents/Github/enfusion-mcp-BK/src/tools/animation-graph-author.ts`
- Modify: `C:/Users/user/Documents/A_documents/Github/enfusion-mcp-BK/src/server.ts`

**Step 1: Read reference files**

Read the LAV25.agr and S105.agr files fully to understand exact output format needed.

**Step 2: Write AGR generator function**

The generator takes vehicle config and returns a string of valid Enfusion text format. Key rules:
- Wheel count determines how many `wheel_N`, `suspension_N` variables and IK chains to generate
- All variable names must match exact strings used by VehicleAnimationComponent (e.g. `wheel_0` not `Wheel_0`)
- IK chain names must match bone names in the vehicle mesh (use `v_suspension0` etc.)
- GlobalTags must include `"VEHICLE"`, `"WHEELED"`, and the vehicle name uppercased

```typescript
function generateAgr(opts: {
  vehicleName: string;
  vehicleType: string;
  wheelCount: number;
  hasTurret: boolean;
  hasSuspensionIK: boolean;
  hasShockAbsorbers: boolean;
  hasSteeringLinkage: boolean;
  seatTypes: string[];
  dialList: string[];
}): string { ... }
```

**Step 3: Write AST generator function**

```typescript
function generateAst(opts: {
  vehicleName: string;
  seatTypes: string[]; // determines animation groups
}): string { ... }
```

The AST groups mirror the seat types. Each group gets a `"Default"` column minimum.

**Step 4: Write the tool**

```typescript
export function registerAnimationGraphAuthor(server: McpServer, config: Config): void {
  server.registerTool(
    "animation_graph_author",
    {
      description:
        "Generate and write .agr and .ast files for a new Arma Reforger vehicle. " +
        "Creates correctly structured animation graph resource files based on LAV25/S105 patterns. " +
        "Use before building the AGF node graph in Workbench. " +
        "Trigger: 'create animation graph for new vehicle', 'generate AGR for vehicle'.",
      inputSchema: {
        vehicleName: z.string().describe("Vehicle name (e.g. 'MyTruck'). Used in file names and GlobalTags."),
        vehicleType: z.enum(["wheeled", "tracked", "helicopter", "boat"]).default("wheeled"),
        wheelCount: z.number().int().min(2).max(8).default(4).describe("Number of wheels (2/4/6/8)."),
        hasTurret: z.boolean().default(false).describe("Add turret variables and bone mask."),
        hasSuspensionIK: z.boolean().default(true).describe("Add suspension IK chains."),
        hasShockAbsorbers: z.boolean().default(false).describe("Add shock absorber IK chains."),
        hasSteeringLinkage: z.boolean().default(false).describe("Add steering axis IK chains."),
        seatTypes: z.array(z.enum(["driver", "gunner", "commander", "passenger"])).default(["driver"]),
        dialList: z.array(z.string()).default([]).describe("Variable names to use as dials (e.g. ['Engine_RPM', 'SPEED'])."),
        outputPath: z.string().describe("Destination folder within mod project (e.g. 'Assets/Vehicles/MyTruck/workspaces')."),
        modName: z.string().optional().describe("Addon folder name. Uses default if omitted."),
        projectPath: z.string().optional().describe("Mod project root. Uses default if omitted."),
      },
    },
    async (opts) => {
      // generate AGR + AST strings, write via project_write logic, return file paths
    }
  );
}
```

**Step 5: Register in server.ts**

```typescript
import { registerAnimationGraphAuthor } from "./tools/animation-graph-author.js";
// in registerTools():
registerAnimationGraphAuthor(server, config);
```

**Step 6: Build**
```bash
cd "C:/Users/user/Documents/A_documents/Github/enfusion-mcp-BK"
npm run build 2>&1
```
Expected: no errors.

**Step 7: Commit**
```bash
git add src/tools/animation-graph-author.ts src/server.ts
git commit -m "feat: add animation_graph_author tool"
```

---

## Task 10: Implement `animation_graph_setup` Tool

**Files:**
- Create: `C:/Users/user/Documents/A_documents/Github/enfusion-mcp-BK/src/tools/animation-graph-setup.ts`
- Modify: `C:/Users/user/Documents/A_documents/Github/enfusion-mcp-BK/src/server.ts`

**Step 1: Read vehicle-animation.md** (written in Task 4) for node hierarchy patterns and step-by-step instructions to embed in the tool output.

**Step 2: Write the AGF instruction generator**

This function takes the same vehicle config and returns a detailed markdown string with Workbench UI instructions for building the AGF node graph:

```typescript
function generateAgfInstructions(opts: VehicleConfig): string {
  // Returns step-by-step guide:
  // 1. Open AGF in Animation Editor
  // 2. Create Master sheet
  // 3. Add Queue node named "MasterControl"
  // 4. [branch per feature: wheels, suspension, steering, dials, seats, turret]
  // Each step: which node type to add, what properties to set, what to connect it to
}
```

**Step 3: Write the prefab setup instructions generator**

```typescript
function generatePrefabInstructions(opts: VehicleConfig): string {
  // Returns: which components to add to vehicle prefab,
  // VehicleAnimationComponent properties (AnimGraph path, AnimInstance path),
  // AlwaysActive setting
}
```

**Step 4: Write the verification checklist generator**

```typescript
function generateChecklist(opts: VehicleConfig): string {
  // Returns: what to check in Workbench Live Debug
  // - Open vehicle prefab in World Editor
  // - Add to scene, enter play mode
  // - Open Animation Editor → Live Debug tab
  // - Check each variable is receiving values
  // - Verify wheel bones rotating
  // - Verify suspension IK working
  // etc.
}
```

**Step 5: Write the tool**

```typescript
export function registerAnimationGraphSetup(server: McpServer, config: Config): void {
  server.registerTool(
    "animation_graph_setup",
    {
      description:
        "Full guided workflow wizard for setting up a vehicle animation graph in Arma Reforger. " +
        "Generates AGR + AST files, provides step-by-step Workbench UI instructions for the AGF node graph, " +
        "prefab component setup, and verification checklist. " +
        "PRIMARY entry point for: 'set up vehicle animation', 'create animation graph for vehicle', " +
        "'vehicle anim graph from scratch'.",
      inputSchema: {
        // same as animation_graph_author plus:
        vehicleName: z.string(),
        vehicleType: z.enum(["wheeled", "tracked", "helicopter", "boat"]).default("wheeled"),
        wheelCount: z.number().int().min(2).max(8).default(4),
        hasTurret: z.boolean().default(false),
        hasSuspensionIK: z.boolean().default(true),
        hasShockAbsorbers: z.boolean().default(false),
        hasSteeringLinkage: z.boolean().default(false),
        seatTypes: z.array(z.enum(["driver", "gunner", "commander", "passenger"])).default(["driver"]),
        dialList: z.array(z.string()).default([]),
        outputPath: z.string(),
        modName: z.string().optional(),
        projectPath: z.string().optional(),
        step: z.enum(["all", "agr", "agf_instructions", "prefab_setup", "checklist"])
          .default("all")
          .describe("Which step to return. 'all' returns everything."),
      },
    },
    async (opts) => {
      // call animation_graph_author logic for AGR/AST generation
      // generate AGF instructions, prefab setup, checklist
      // return combined markdown
    }
  );
}
```

**Step 6: Register in server.ts**
```typescript
import { registerAnimationGraphSetup } from "./tools/animation-graph-setup.js";
// in registerTools():
registerAnimationGraphSetup(server, config);
```

**Step 7: Build**
```bash
cd "C:/Users/user/Documents/A_documents/Github/enfusion-mcp-BK"
npm run build 2>&1
```
Expected: no errors.

**Step 8: Commit**
```bash
git add src/tools/animation-graph-setup.ts src/server.ts
git commit -m "feat: add animation_graph_setup tool"
```

---

## Task 11: Update MCP Server Guidance

**Files:**
- Read first: `C:/Users/user/Documents/A_documents/Github/enfusion-mcp-BK/src/server.ts`
- Check if there is an MCP server instructions/prompt file  -  look in `src/prompts/` for any system prompt or instructions file

**Step 1: Check for system-level instructions**
```bash
ls "C:/Users/user/Documents/A_documents/Github/enfusion-mcp-BK/src/prompts/" 2>/dev/null
```

**Step 2: If a system prompt or instructions file exists**, add routing note:
```
For animation graph tasks (setting up vehicle animation, inspecting AGR/AGF files, understanding nodes):
Use animation_graph_inspect to read existing graphs before suggesting changes.
Use animation_graph_setup as the primary entry point for new vehicle animation graph setup.
```

**Step 3: Build final time**
```bash
cd "C:/Users/user/Documents/A_documents/Github/enfusion-mcp-BK"
npm run build 2>&1
```

**Step 4: Final commit**
```bash
git add -A
git commit -m "feat: update MCP guidance for animation graph tools"
```

---

## Done

All tasks complete when:
- `C:/Users/user/.mcp/arma-knowledge/patterns/Character_And_Animation/animation/` contains all 6 files
- Old `animation-graph.md` is deleted
- Main `INDEX.md` points to `animation/INDEX.md`
- `npm run build` passes with 3 new tools registered
- All commits pushed or ready to push
