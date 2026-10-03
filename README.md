# enfusion-mcp (private fork, `1.0.0-ff`)

MCP server for Arma Reforger modding: API and wiki search, base-game asset reading straight out of
`.pak` archives, project scaffolding, and (in principle) live Workbench control. This fork targets
**Arma Reforger 1.8 on Linux under Proton** and is used by the `reforger-mods` project.

## Install

This fork is not on npm. `npx -y enfusion-mcp` installs **upstream**, not this code.

```bash
git clone git@github.com:fmarcgh/enfusion-mcp.git && cd enfusion-mcp
npm install && npm run build
claude mcp add --scope user enfusion-mcp \
  -e ENFUSION_WORKBENCH_PATH="$HOME/.local/share/Steam/steamapps/common/Arma Reforger Tools" \
  -e ENFUSION_GAME_PATH=/path/to/game-or-server \
  -e ENFUSION_PROJECT_PATH=/path/to/your/mods \
  -- node "$PWD/dist/index.js"
```

**Rebuild after every source change** (`npm run build`) and reload the client. The server runs
`dist/`, so an edit to `src/` does nothing until then.

## Tools

### Offline (pure Node, no Workbench)

| Tool | What it does |
|------|-------------|
| `api_search` | Search the scraped script API (8,972 classes on 1.8: 887 Enfusion + 8,085 Arma), with inherited members and `format: 'tree'` for an inheritance view |
| `component_search` | Search ScriptComponent descendants by category and event handler |
| `wiki_search` / `wiki_read` | Search and read the bundled wiki corpus (274 pages) |
| `wb_knowledge` | Search the bundled modding knowledge base (offline despite the `wb_` prefix) |
| `game_browse` / `game_read` | Browse and read base-game files, loose or inside `.pak` |
| `asset_search` | Find base-game assets by name across loose files and `.pak` |
| `game_duplicate` | Copy a base-game prefab or config into a mod, resolving its ancestor chain |
| `project` | `browse` / `read` / `write` files in a mod project |
| `mod` | `create` (scaffold an addon), `validate` (structure, gproj, scripts, prefabs, configs, references, naming), `build` (Workbench CLI) |
| `prefab` | `create` a prefab from a template, or `inspect` its merged inheritance chain |
| `script_create` | Generate a `.c` file (component, gamemode, action, entity, manager, modded, basic) |
| `layout_create` | Generate a `.layout` (hud, menu, dialog, list, custom) |
| `config_create` | Generate factions, missions, entity catalogs, editor placeables |
| `scenario_create` / `scenario_create_conflict` | Generate scenario files (Conflict: header, world stub, layers) |
| `building_setup` | Set up a destructible building from a Blender export manifest |
| `animation_graph` | Author vehicle `.agr`/`.ast` animation graph scaffolds |
| `server_config` | Generate a dedicated server config |
| `workshop_info` | Read Workshop metadata from a `.gproj` |

### Live Workbench (`wb_*`)

`wb_launch` `wb_connect` `wb_diagnose` `wb_cleanup` `wb_state` `wb_play` `wb_stop` `wb_save`
`wb_undo_redo` `wb_open_resource` `wb_reload` `wb_execute_action` `wb_entity_create`
`wb_entity_delete` `wb_entity_duplicate` `wb_entity_list` `wb_entity_inspect` `wb_entity_modify`
`wb_entity_select` `wb_component` `wb_terrain` `wb_layers` `wb_resources` `wb_prefabs`
`wb_clipboard` `wb_script_editor` `wb_localization` `wb_projects` `wb_validate`

They talk to the Workbench NET API (TCP `127.0.0.1:5775`) through handler scripts in
`mod/Scripts/WorkbenchGame/EnfusionMCP/`. **They never worked on 1.7 and are untested on 1.8**: the
handlers have to compile inside the open project's WorkbenchGame module, and they did not. For
compiling and publishing, `reforger-mods/scripts/wb.sh` drives the Workbench CLI directly and is the
proven path. Linux launch details: [docs/LINUX_PROTON.md](docs/LINUX_PROTON.md).

### MCP resources

`enfusion://class/{className}`, `enfusion://pattern/{patternName}`, `enfusion://group/{groupName}`.

## Configuration

All optional. Environment variables beat `~/.enfusion-mcp/config.json`.

| Variable | Meaning | Default |
|----------|---------|---------|
| `ENFUSION_WORKBENCH_PATH` | Arma Reforger Tools install | Windows Steam path |
| `ENFUSION_GAME_PATH` | Game (or dedicated server) install read by `game_*`/`asset_search` | sibling of the Tools path |
| `ENFUSION_PROJECT_PATH` | Default mod directory | `~/Documents/My Games/ArmaReforgerWorkbench/addons` |
| `ENFUSION_EXTRACTED_PATH` | Directory of extracted base-game files, read before the `.pak` | unset |
| `ENFUSION_DEFAULT_MOD` | Mod name used when a tool call names none | unset |
| `ENFUSION_MCP_DATA_DIR` | Where the API index and wiki corpus live | `data/` in the package |
| `ENFUSION_WORKBENCH_HOST` / `_PORT` | NET API endpoint | `127.0.0.1` / `5775` |
| `ENFUSION_WB_LAUNCHER` and friends | Linux launch strategy | see `docs/LINUX_PROTON.md` |

## Refreshing the API index after a game update

```bash
npm run scrape -- --workbench-path "$HOME/.local/share/Steam/steamapps/common/Arma Reforger Tools"
npm run build
```

It reads the Doxygen docs the Tools ship under `Workbench/docs/`. Up to 1.7 those were zips; **1.8
ships them unpacked** (`ArmaReforgerScriptAPIPublic/html/`, `EnfusionScriptAPI/html/`) and the
scraper accepts both. Check the closing `Scrape complete:` counts: a scrape that finds no docs warns
and leaves the old index in place. Last scraped: Tools buildid 24870687 (1.8.0.13), 2026-10-03.

## Development

```bash
npm test   # 446 tests; 2 known failures, see CHANGELOG
```

Requires Node 20+.

## Upstream and licence

Maintained fork of [steffenbk/enfusion-mcp-BK](https://github.com/steffenbk/enfusion-mcp-BK), itself
a fork of [Articulated7/enfusion-mcp](https://github.com/Articulated7/enfusion-mcp). MIT, same as
upstream; the original copyright notice is kept in `LICENSE`.
