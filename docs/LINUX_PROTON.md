# Running on Linux (Proton) + Steam Offline Mode

The Arma Reforger Workbench is a **Windows** application. This fork can launch it on
Linux through **Proton**, so the `wb_*` / `mod_build` tools work on a Linux box.

## How launching works

`launcher` config (env `ENFUSION_WB_LAUNCHER`) selects the strategy:

| value | behavior |
|-------|----------|
| `auto` (default) | Linux → `proton`; Windows/macOS → `native` |
| `native` | spawn the `.exe` directly (Windows, or an already-wrapped exe) |
| `proton` | run the exe via `proton run` with the Steam compat env (Linux) |
| `steam` | launch via `steam -applaunch <appid>` (Steam applies its own runtime) |

On Linux with `auto`/`proton`, the launcher auto-detects:
- **Proton**  -  newest `Proton - Experimental` (or any `Proton*`) under `steamapps/common`. Override: `ENFUSION_PROTON_PATH`.
- **Steam root**  -  `~/.local/share/Steam`, `~/.steam/steam`, or the Flatpak path. Override: `ENFUSION_STEAM_ROOT`.
- **compatdata prefix**  -  `{steamRoot}/steamapps/compatdata/{appId}` (appId default `1874910`). Override: `ENFUSION_STEAM_COMPAT_DATA_PATH`.

It then spawns: `proton run <Workbench.exe> [-gproj …]` with
`STEAM_COMPAT_DATA_PATH` + `STEAM_COMPAT_CLIENT_INSTALL_PATH` set. The Workbench NET
API (TCP `127.0.0.1:5775`) is reachable from the host because Proton shares the host
network namespace.

**If `proton run` doesn't bring up the NET API**, set `ENFUSION_WB_LAUNCHER=steam`  - 
Steam launches the Tools with its full runtime container, which is the most reliable
path. (Steam forwards trailing args, so `-gproj` still applies.)

First-run note: launch the Tools through Steam once so Proton creates the
`compatdata/<appid>` prefix and Steam caches the license, before relying on the MCP
launcher.

## Steam Offline Mode (run Workbench on the laptop *and* play Reforger on another PC)

One Steam account can only be "online + in a game" on **one** device at a time  - 
launching Workbench on the laptop while a second PC plays Reforger signs the PC out.
The free fix is **Steam Offline Mode** on the laptop:

1. On the laptop, sign into Steam online once (so the Tools are installed/updated and
   the license is cached).
2. Steam → top-left menu → **Go Offline** (Steam keeps running locally  -  Proton and
   the license still work offline).
3. Launch Workbench via the MCP (`wb_*`)  -  it runs under Proton against the offline
   Steam client.
4. On the other PC, play/join Reforger **online** as normal  -  no session conflict.

Caveats: no Steam achievements while offline; sign back online occasionally to update.
Family Sharing does **not** allow simultaneous play, and the Tools are tied to game
ownership, so a second free account isn't a viable alternative  -  Offline Mode is the
clean option.
