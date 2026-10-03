# Running the Workbench on Linux (Proton)

The Workbench is a Windows application. This fork can launch it through Proton so the `wb_*` and
`mod build` tools have something to talk to.

## Launch strategy

`ENFUSION_WB_LAUNCHER` picks it:

| value | behaviour |
|-------|-----------|
| `auto` (default) | Linux -> `proton`; Windows/macOS -> `native` |
| `native` | spawn the `.exe` directly |
| `proton` | `proton run <exe>` with the Steam compat environment |
| `steam` | `steam -applaunch <appid>`; Steam applies its own runtime, but returns immediately with no exit code |

With `auto`/`proton` the launcher detects, each overridable:

- Proton: newest `Proton - Experimental` (or any `Proton*`) under `steamapps/common`. `ENFUSION_PROTON_PATH`.
- Steam root: `~/.local/share/Steam`, `~/.steam/steam`, or the Flatpak path. `ENFUSION_STEAM_ROOT`.
- Prefix: `{steamRoot}/steamapps/compatdata/{appId}`, appId `1874910`. `ENFUSION_STEAM_COMPAT_DATA_PATH`, `ENFUSION_STEAM_APPID`.

The NET API (TCP `127.0.0.1:5775`) is reachable from the host because Proton shares its network
namespace. Launch the Tools through Steam once first so the prefix exists and the licence is cached.

## Traps when running the exe under Proton directly

Each of these presents as a different bug. `reforger-mods/scripts/wb.sh` handles all four and is the
reference implementation.

- **The working directory picks the Steam app.** `SteamAPI_Init` reads `steam_appid.txt` from the
  CWD: the game dir says 1874880, the Workbench dir 1874910. With the wrong one, platform services
  fail right after `Game successfully created`. Compiling finishes before that, so validation looks
  fine while packing and publishing silently produce nothing. Use the Workbench dir as CWD.
- **Hand the base game over with `-addonsDir`.** The Tools prefix has no registry entry for the game,
  so every project fails with `Game addon '58D0FB3206B6F859' not found`.
- **Use `Z:` paths, not `S:`.** `S:` is a drive mapping Steam creates; it may not exist when Proton is
  run directly. `Z:` maps `/` and always exists.
- **`-wbSilent` suppresses packing and publishing** without saying so. Fine for validation only.

## Two machines, one Steam account

One account can be in a game on only one device at a time. To run the Workbench on one machine
while the same account plays on another, put the Workbench machine's Steam client into Offline Mode
(sign in online once first so the licence is cached). Running Proton directly, without the Steam
client, avoids the conflict too.
