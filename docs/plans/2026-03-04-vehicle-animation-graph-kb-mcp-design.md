# Design: Vehicle Animation Graph Knowledge Base + MCP Tools

**Date:** 2026-03-04
**Status:** Approved

---

## Problem

The arma-knowledge patterns base has a single `animation-graph.md` covering basics only  -  no vehicle-specific content, no comprehensive node reference, no PAP/SIGA coverage. The enfusion-mcp server has no tools for animation graph work. Modders building vehicle animation graphs have no guided workflow.

---

## Goals

1. Restructure animation knowledge into a navigable subfolder with comprehensive, vehicle-focused content.
2. Add three MCP tools covering inspection, file authoring, and guided setup of vehicle animation graphs.
3. Update MCP server guidance so client routes animation tasks to the correct tools.

---

## Part 1: Knowledge Base Restructure

### Folder Structure

```
C:\Users\user\.mcp\arma-knowledge\patterns\Character_And_Animation\
├── gadgets-actions.md                  (existing, unchanged)
├── animation-graph.md                  (DELETED  -  content migrated)
└── animation/
    ├── INDEX.md                        (~50 lines)
    ├── core-concepts.md                (~200 lines)
    ├── node-reference.md               (~600 lines)
    ├── vehicle-animation.md            (~500 lines)
    ├── procedural-pap-siga.md          (~400 lines)
    └── script-integration.md           (~150 lines)
```

### File Contents

**`animation/INDEX.md`**
Task-to-file routing table. Examples:
- "Setting up new vehicle animation" → `core-concepts.md` + `vehicle-animation.md`
- "Understanding a specific node" → `node-reference.md`
- "Legacy PAP vehicle" → `procedural-pap-siga.md`
- "Driving graph vars from script" → `script-integration.md`

**`core-concepts.md`**
- All animation file types table: `.agr`, `.agf`, `.ast`, `.asi`, `.anm`, `.txa`, `.aw`, `.pap`, `.siga`, `.ae`, `.asy`, `.adeb`  -  purpose and dependencies
- Two-phase evaluation model (DOWN/UP phases)  -  why evaluation order matters
- Critical editor rule: AGF nodes MUST be added via Workbench UI  -  file edits are wiped on open
- AGR responsibilities vs AGF responsibilities (what lives where)
- Real-time vs normal time
- Common properties shared by all nodes

**`node-reference.md`**
Every AGF node type with: purpose, key properties, usage pattern, gotchas. Categories:
- Attachment
- Blend nodes: Blend, BlendN, BlendT, BlendTAdd, BlendTW
- Queue
- Switch
- Buffer: BufferSave, BufferUse
- Filter
- Ctx: CtxBegin, CtxEnd
- Event system: AnimSrcEvent, AnimSrcEventGeneric, AnimSrcEventAudio
- Function: FunctionBegin, FunctionCall, FunctionEnd
- Group Select
- IK nodes: IK2, IK2Plane, IK2Target, IKLock, IKRotation
- IK solvers: FabrikSolver, TwoBoneSolver, LookAtSolver, LookInDirSolver, PoleSolver
- RBF
- WeaponIK
- Memory
- Procedural: Constraint, ProcTransform (AnimNodeProcTransform)
- Constraint types: AnimSrcConstraintPosition, AnimSrcConstraintParent
- Sleep
- Source nodes: BindPose, Pose, Pose2, Source, SourceInLoopOut, SourceSync
- State Machine: State, StateMachine
- Tag
- Time: TimeSave, TimeScale, TimeUse
- Variable: VarReset, VarSet, VarUpdate
- Var Set item types reference

**`vehicle-animation.md`**
- Standard variable set with ranges: wheel_0-7, suspension_0-7, steering, steering_axle2, steering_delay, Engine_RPM, Gearbox_RPM, VehicleThrottle, VehicleSteering, VehicleAccelerationFB/LR, SpineAccelerationFB/LR, VehicleBrake, VehicleHandBrake, YawAngle, Yaw, Pitch, SPEED, Speed_dumping, WaterLevel, IsSwimming, IsInVehicle, LookX/Y, AimX/Y, SeatPositionType, IsDriver, Vehicle_Wobble, Suspension_dumping, Suspension_shake, FUEL1, Engine_RPM, LocalTime, VehicleDoorState/Type, POWER_IO, Dial_random, Horn, TurnOut
- Standard commands: CMD_Vehicle_GetIn/Out, CMD_Vehicle_SwitchSeat, CMD_Death, CMD_Unconscious, CMD_OpenDoor/CloseDoor, CMD_Vehicle_GearSwitch, CMD_Vehicle_Engine_StartStop, CMD_HandBrake, CMD_Lights, CMD_Wheeled_Action, CMD_Vehicle_FinishActionQueue
- Standard IK chain patterns: character limbs (LeftLeg/RightLeg/LeftArm/RightArm with joints + MiddleJoint + ChainAxis), vehicle suspension chains, shock absorber chains, steering axis chains, shaft chains
- Standard bone mask structure: Chassis (all v_ prefixed mechanical bones), Body (dials, lights, mirrors), Turret (turret bones + sight covers + antennas), Turret_Pose (root/turret_slot/turret_01), GlobalTags convention
- Node hierarchy patterns:
  - Wheel rotation: ProcTransform driven by wheel_N variable (continuous spin)
  - Suspension travel: IK2 + IK2Target driven by suspension_N
  - Steering linkage: ProcTransform rotation driven by steering variable
  - Dial/gauge: Pose node sampling frame by RPM/speed/fuel variable (0=min, 1=max frame)
  - Turret rotation: ProcTransform on turret bone driven by YawAngle/AimX
  - Character seat: StateMachine with states per seat type, Queue for action interrupts, IK2+IK2Target for hand placement
  - Suspension shake/damping: VarUpdate node rate-limiting Suspension_shake variable feed into TimeScale
- Step-by-step: creating a new wheeled vehicle AGR from scratch
  1. Define bone naming convention (v_ prefix for vehicle bones)
  2. List all variables needed for wheel count + feature set
  3. Define IK chains for each suspension/steering bone
  4. Define bone masks grouping bones by animation layer
  5. Set GlobalTags (VEHICLE, WHEELED, vehicle name)
  6. Set DefaultRunNode to master Queue node name
  7. Build AGF in Workbench UI following node hierarchy patterns
- Annotated S105 example (simple 4-wheel civilian vehicle)
- Annotated LAV25 example (complex 8-wheel armored vehicle with turret, IK suspension linkages, sight covers, crew seats, amphibious variables)
- Common pitfalls: missing v_ prefix, wrong ChainAxis direction, IK chain joint order, variable range mismatch causing clamped animation

**`procedural-pap-siga.md`**
- Legacy warning: PAP/SIGA is being phased out  -  use AGF/AGR for all new work
- When you still need it: existing base game assets that use it, cannot be migrated
- PAP node types: Signal, Constants, Bone, RotationSet/Make/Break, TranslateSet/Make/Break, ScaleSet/Make/Break
- SIGA node types: Input, Output, Value, Random, Generator
- Math nodes: Sum, Sub, Mul, Div, Pow, Remainder, Min, Max, Abs, Exp, Ln, Log2, Log10, Average
- Conversion nodes: Convertor, Db2Gain, Gain2Db, St2Gain, Gain2St, Freq2Oc
- Signal shaping: Env (Envelope), Interpolate, Smoother
- Rounding/clamping: Floor, Ceil, Round, Clamp, ClampMin, ClampMax
- Trig: Sin, Cos, Tan, ASin, ACos, ATan
- Interpolation curve types reference
- Critical data flow: engine runtime value → Input (siga) → math chain → Output (siga) → Signal (pap) → RotationSet/TranslateSet → bone
- Critical name matching rule: Signal node `Name` in .pap MUST exactly match Output node `Name` in .siga
- Input node `Name` must exactly match engine-side identifier
- `Update collider` OFF by default on RotationSet/TranslateSet  -  only enable if physics needs the bone
- ProcAnimComponent prefab setup: `ResourceName` = .pap path, `BoneNames` = target bone list

**`script-integration.md`**
- AnimationControllerComponent API overview
- BindFloatVariable(name) → returns variable ID (cache at init, not every frame)
- SetFloatVariable(id, value) pattern
- BindIntVariable / SetIntVariable for int vars
- Correct lifecycle: bind in OnPostInit, set in EOnFrame
- VehicleAnimationComponent vs BaseItemAnimationComponent  -  when to use which
- AlwaysActive flag  -  when needed
- Replication: animation vars are client-side only  -  never replicate animation state, set from locally available data
- Script-driven continuous rotation example (full code)
- Driving suspension variable from physics callback example

### Changes to Existing Files

- `patterns/Character_And_Animation/animation-graph.md`  -  deleted, content migrated and expanded
- `patterns/INDEX.md`  -  `animation-graph.md` row replaced with single row:
  `animation/INDEX.md` | Vehicle animation graph patterns, node reference, PAP/SIGA, script integration  -  see local index for task routing

---

## Part 2: New MCP Tools

All three tools added to `enfusion-mcp-BK` repo, following existing tool patterns in `src/tools/`.

### Tool 1: `animation_graph_inspect`

**Purpose:** Read and summarize an existing `.agr`, `.agf`, or `.ast` file.

**Input parameters:**
- `path` (required)  -  file path, relative to mod or game data
- `source`  -  `"mod"` | `"game"` (default `"mod"`)  -  whether to read from project or base game

**Output:** Structured summary:
- For `.agr`: variable list (name, type, min, max, default), IK chain names + joint counts, bone mask names + bone counts, command list, GlobalTags, DefaultRunNode, AGF file references
- For `.agf`: sheet names, all node names + types per sheet, node child/parent relationships (flat list)
- For `.ast`: group names, animation names per group, column names

**Implementation:** Uses `project_read` or `game_read` to load the file, parses the Enfusion text serialization format, returns structured JSON summary. No Workbench connection required.

**Use case:** client audits an existing vehicle graph before suggesting modifications. User asks "what variables does the BRDM2 use?"  -  client inspects the AGR and answers precisely.

---

### Tool 2: `animation_graph_author`

**Purpose:** Generate and write `.agr` and `.ast` files for a new vehicle.

**Input parameters:**
- `vehicleName` (required)  -  used for file naming and GlobalTags
- `vehicleType`  -  `"wheeled"` | `"tracked"` | `"helicopter"` | `"boat"` (default `"wheeled"`)
- `wheelCount`  -  number of wheels (2, 4, 6, 8)  -  determines wheel_N/suspension_N variable count
- `hasTurret`  -  boolean, adds turret variables + bone mask
- `hasSuspensionIK`  -  boolean, adds full suspension IK chain set
- `hasShockAbsorbers`  -  boolean, adds shock absorber IK chains
- `hasSteeringLinkage`  -  boolean, adds steering axis IK chains
- `seatTypes`  -  array: `["driver", "gunner", "commander", "passenger"]`
- `dialList`  -  array of dial names (e.g. `["Engine_RPM", "SPEED", "FUEL1"]`)
- `outputPath` (required)  -  destination path within mod project
- `modName`  -  addon name (uses default if omitted)

**Output:** Writes two files:
- `<vehicleName>.agr`  -  full AGR with all variables, IK chains, bone masks, commands, GlobalTags
- `<vehicleName>.ast`  -  AST with animation groups matching seat types

**Implementation:** Template-driven generation based on LAV25/S105 patterns. Builds the Enfusion text serialization format programmatically. Uses `project_write` to save.

**Use case:** User starts a new vehicle mod  -  client generates the AGR/AST scaffold in seconds. User then opens in Workbench to build the AGF node graph with UI guidance from Tool 3.

---

### Tool 3: `animation_graph_setup`

**Purpose:** Full guided workflow wizard for vehicle animation graph setup.

**Input parameters:** Same as `animation_graph_author` plus:
- `step`  -  `"all"` | `"agr"` | `"agf_instructions"` | `"prefab_setup"` | `"checklist"` (default `"all"`)

**Output:** Multi-section response:

1. **AGR + AST generation**  -  calls `animation_graph_author` internally, confirms files written
2. **AGF node graph instructions**  -  step-by-step Workbench UI guide for building the node graph:
   - Which sheets to create
   - Which nodes to add in which order (Queue → StateMachine → branches)
   - Exact node properties to set for each feature (wheels, suspension, steering, dials, seats)
   - Variable bindings to configure
   - How to connect nodes (child references)
3. **Prefab component setup**  -  which components to add to the vehicle prefab, which properties to set (`AnimGraph`, `AnimInstance`, `AlwaysActive`)
4. **Verification checklist**  -  what to check in Workbench Live Debug to confirm the graph is working

**Implementation:** Pure knowledge synthesis  -  no Workbench API calls needed. Returns structured markdown guidance generated from the vehicle-animation patterns.

**Use case:** End-to-end onboarding for a new vehicle animation graph. User provides vehicle specs, gets everything they need to go from zero to working animation.

---

## Part 3: MCP Server Guidance Updates

- Update `animation_graph_inspect` tool description to include trigger phrases: "what variables does X use", "inspect animation graph", "read AGR/AGF"
- Update `animation_graph_setup` tool description as primary entry point: "set up vehicle animation", "create animation graph for vehicle", "vehicle anim graph from scratch"
- Add routing note to MCP server instructions: animation graph tasks → use `animation_graph_*` tools before attempting manual file reads
- Update `wiki_search` index with vehicle animation topics so it surfaces the new patterns files

---

## Implementation Order

1. Write knowledge base files (no code dependencies, can be done immediately)
2. Delete old `animation-graph.md`, update main `INDEX.md`
3. Implement `animation_graph_inspect` tool (read + parse, no generation logic)
4. Implement `animation_graph_author` tool (template generation)
5. Implement `animation_graph_setup` tool (builds on author + adds guidance)
6. Update MCP server tool descriptions and guidance

---

## Out of Scope

- AGF node editing via Workbench API (NET API does not expose Animation Editor)
- `.anm` / `.txa` animation file generation (requires Blender + export pipeline)
- Character animation graphs (human characters  -  separate system, different patterns)
- Tracked vehicle specifics (future extension of vehicle-animation.md)
