/**
 * TCP client for the Workbench NET API.
 *
 * Each rawCall() opens a fresh TCP connection, sends one request, reads the
 * response, and closes the socket (protocol requirement).
 *
 * call() wraps rawCall() with auto-launch: if Workbench isn't running,
 * it installs handler scripts, launches the exe, waits for the NET API,
 * and retries the original call.
 */

import { Socket } from "node:net";
import { existsSync, mkdirSync, copyFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { spawn, execSync } from "node:child_process";
import { encodeRequest, decodeResponse } from "./protocol.js";
import { logger } from "../utils/logger.js";
import type { Config } from "../config.js";
import { generateGproj } from "../templates/gproj.js";

const DEFAULT_CLIENT_ID = "EnfusionMCP";
const DEFAULT_TIMEOUT_MS = 10_000;
/** Maximum response size (10 MB) to prevent memory exhaustion from malformed/unexpected data. */
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024;
const WORKBENCH_EXE = "ArmaReforgerWorkbenchSteamDiag.exe";
const WORKBENCH_SUBDIR = "Workbench";
const HANDLER_FOLDER = "EnfusionMCP";
const LAUNCH_POLL_INTERVAL_MS = 3_000;
const LAUNCH_TIMEOUT_MS = 90_000;
/** Delay after killing Workbench before relaunching, to let the port release. */
const KILL_SETTLE_MS = 3_000;
/** How long to wait for Workbench to recompile handler scripts after installation. */
const HANDLER_RECOMPILE_TIMEOUT_MS = 30_000;
/** Interval between polls while waiting for handler script recompilation. */
const HANDLER_RECOMPILE_POLL_MS = 2_000;

export type WorkbenchMode = "edit" | "play" | "unknown";

export interface DiagnosticReport {
  host: string;
  port: number;
  workbenchExe: { path: string; exists: boolean } | null;
  projectPath: { path: string; exists: boolean } | null;
  defaultMod: string | null;
  bundledScripts: { path: string; exists: boolean };
  standaloneAddon: { path: string; exists: boolean; fileCount: number };
  installedMods: Array<{ modDir: string; handlerDir: string; fileCount: number }>;
  /** Result of the NET API probe. */
  netApi: "up_with_handlers" | "up_no_handlers" | "refused" | "timeout" | "error";
  netApiError?: string;
}

export interface WorkbenchState {
  connected: boolean;
  mode: WorkbenchMode;
  lastUpdated: number;
}

export interface WorkbenchCallOptions {
  /** Timeout in milliseconds (default 10 000). */
  timeout?: number;
  /** Skip auto-launch on connection failure (used internally by ping). */
  skipAutoLaunch?: boolean;
}

export class WorkbenchError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "CONNECTION_REFUSED"
      | "TIMEOUT"
      | "PROTOCOL_ERROR"
      | "API_ERROR"
      | "LAUNCH_FAILED" = "API_ERROR"
  ) {
    super(message);
    this.name = "WorkbenchError";
  }
}

export class WorkbenchClient {
  private launchPromise: Promise<void> | null = null;
  /** The .gproj of the project we last launched, to avoid needless restarts. */
  private currentGproj: string | null = null;
  private _state: WorkbenchState = { connected: false, mode: "unknown", lastUpdated: 0 };

  /** Current cached connection state. Updated after every successful call. */
  get state(): Readonly<WorkbenchState> {
    return this._state;
  }

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly config?: Config,
    private readonly clientId: string = DEFAULT_CLIENT_ID
  ) {}

  /**
   * Call a Workbench NET API function.
   * Auto-launches Workbench if not running.
   */
  async call<T = Record<string, unknown>>(
    apiFunc: string,
    params: Record<string, unknown> = {},
    options: WorkbenchCallOptions = {}
  ): Promise<T> {
    try {
      const result = await this.rawCall<T>(apiFunc, params, options);
      this._state.connected = true;
      this._state.lastUpdated = Date.now();
      this.extractMode(result);
      return result;
    } catch (err) {
      if (err instanceof WorkbenchError) {
        if (err.code === "CONNECTION_REFUSED" || err.code === "TIMEOUT" || err.code === "PROTOCOL_ERROR") {
          this._state = { connected: false, mode: "unknown", lastUpdated: Date.now() };
        }
        if (!options.skipAutoLaunch && this.config) {
          if (err.code === "CONNECTION_REFUSED") {
            // Workbench not running  -  install handlers, launch, retry
            logger.info(`Workbench not running, auto-launching...`);
            await this.ensureRunning();
            const result = await this.rawCall<T>(apiFunc, params, options);
            this._state.connected = true;
            this._state.lastUpdated = Date.now();
            this.extractMode(result);
            return result;
          }
          if (err.code === "API_ERROR" && err.message.includes("Undefined API func")) {
            // Workbench is running but our custom handler scripts aren't compiled.
            // This happens when the user opened Workbench manually, or when handlers
            // were cleaned up but Workbench kept running.
            logger.info(`Handler scripts not loaded in Workbench, recovering...`);
            await this.recoverMissingHandlers();
            const result = await this.rawCall<T>(apiFunc, params, options);
            this._state.connected = true;
            this._state.lastUpdated = Date.now();
            this.extractMode(result);
            return result;
          }
        }
      }
      throw err;
    }
  }

  /**
   * Explicitly refresh cached state by calling EMCP_WB_GetState.
   */
  async refreshState(): Promise<WorkbenchState> {
    try {
      await this.call<Record<string, unknown>>("EMCP_WB_GetState");
      return { ...this._state };
    } catch {
      this._state = { connected: false, mode: "unknown", lastUpdated: Date.now() };
      return { ...this._state };
    }
  }

  /**
   * Ensure Workbench is running. Installs handler scripts, launches exe,
   * and waits for NET API. Safe to call concurrently  -  deduplicates launches.
   * @param gprojPath Optional .gproj file path to open directly (skips launcher).
   */
  async ensureRunning(gprojPath?: string): Promise<void> {
    if (!this.config) {
      throw new WorkbenchError("No config provided  -  cannot auto-launch Workbench.", "LAUNCH_FAILED");
    }

    // Deduplicate concurrent calls  -  all callers await the same promise
    if (this.launchPromise) {
      return this.launchPromise;
    }

    const promise = this.launchWorkbench(gprojPath).finally(() => {
      // Only clear if this is still the active promise (guards against re-entrant calls)
      if (this.launchPromise === promise) {
        this.launchPromise = null;
      }
    });

    this.launchPromise = promise;
    return promise;
  }

  /**
   * Quick health check. Returns true if Workbench responds, false otherwise.
   * Does NOT auto-launch.
   *
   * Uses our custom EMCP_WB_Ping handler (not the built-in GetLoadedProjects)
   * so the launch poller only succeeds once the mod's handler scripts have
   * finished compiling  -  avoiding a race where the NET API socket is up but
   * custom handlers aren't loaded yet.
   */
  async ping(): Promise<boolean> {
    try {
      await this.rawCall("EMCP_WB_Ping", {}, { timeout: 3000, skipAutoLaunch: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Remove injected handler scripts from a mod's directory.
   * Call this after Workbench work is done, before publishing the mod.
   * Deletes Scripts/WorkbenchGame/EnfusionMCP/ from the mod.
   * Safe to call even if scripts were never injected.
   */
  cleanupHandlerScripts(modDir: string): boolean {
    const handlerDir = resolve(modDir, "Scripts", "WorkbenchGame", HANDLER_FOLDER);
    logger.info(`Checking for handler scripts at: ${handlerDir}`);
    if (!existsSync(handlerDir)) {
      logger.info(`Handler scripts not found at ${handlerDir}`);
      return false;
    }
    try {
      rmSync(handlerDir, { recursive: true, force: true });
      logger.info(`Removed handler scripts from ${handlerDir}`);
      // Clean up empty parent dirs
      const wbGameDir = join(modDir, "Scripts", "WorkbenchGame");
      if (existsSync(wbGameDir) && readdirSync(wbGameDir).length === 0) {
        rmSync(wbGameDir);
      }
      return true;
    } catch (e) {
      logger.warn(`Failed to clean up handler scripts: ${e}`);
      return false;
    }
  }

  /**
   * Collect a diagnostic snapshot: config, file system, and NET API state.
   * Does NOT auto-launch Workbench or throw  -  always returns a report.
   */
  async diagnose(): Promise<DiagnosticReport> {
    // --- Config info ---
    const host = this.host;
    const port = this.port;
    const defaultMod = this.config?.defaultMod ?? null;

    // Workbench exe
    let workbenchExe: DiagnosticReport["workbenchExe"] = null;
    if (this.config) {
      const exePath = this.findWorkbenchExe();
      const candidate =
        exePath ??
        join(this.config.workbenchPath, WORKBENCH_SUBDIR, WORKBENCH_EXE);
      workbenchExe = { path: candidate, exists: existsSync(candidate) };
    }

    // Project path
    let projectPathInfo: DiagnosticReport["projectPath"] = null;
    if (this.config?.projectPath) {
      projectPathInfo = {
        path: this.config.projectPath,
        exists: existsSync(this.config.projectPath),
      };
    }

    // Bundled handler scripts (inside this package)
    const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const bundledDir = join(packageRoot, "mod", "Scripts", "WorkbenchGame", HANDLER_FOLDER);
    const bundledScripts = { path: bundledDir, exists: existsSync(bundledDir) };

    // Standalone addon
    const standaloneBase = this.config?.projectPath
      ? join(this.config.projectPath, HANDLER_FOLDER)
      : join("<unknown>", HANDLER_FOLDER);
    const standaloneScriptsDir = join(standaloneBase, "Scripts", "WorkbenchGame", HANDLER_FOLDER);
    const standaloneFileCount = existsSync(standaloneScriptsDir)
      ? readdirSync(standaloneScriptsDir).filter((f) => f.endsWith(".c")).length
      : 0;
    const standaloneAddon = {
      path: standaloneBase,
      exists: existsSync(standaloneBase),
      fileCount: standaloneFileCount,
    };

    // Scan project path for mods that have handler scripts installed
    const installedMods: DiagnosticReport["installedMods"] = [];
    if (this.config?.projectPath && existsSync(this.config.projectPath)) {
      try {
        for (const entry of readdirSync(this.config.projectPath, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          if (entry.name === HANDLER_FOLDER) continue; // standalone, covered above
          const handlerDir = join(this.config.projectPath, entry.name, "Scripts", "WorkbenchGame", HANDLER_FOLDER);
          if (existsSync(handlerDir)) {
            const fileCount = readdirSync(handlerDir).filter((f) => f.endsWith(".c")).length;
            installedMods.push({ modDir: join(this.config.projectPath, entry.name), handlerDir, fileCount });
          }
        }
      } catch { /* ignore */ }
    }

    // --- NET API probe ---
    let netApi: DiagnosticReport["netApi"] = "refused";
    let netApiError: string | undefined;
    try {
      await this.rawCall("EMCP_WB_Ping", {}, { timeout: 3000, skipAutoLaunch: true });
      netApi = "up_with_handlers";
    } catch (err) {
      if (err instanceof WorkbenchError) {
        netApiError = err.message;
        if (err.code === "CONNECTION_REFUSED") {
          netApi = "refused";
        } else if (err.code === "TIMEOUT") {
          netApi = "timeout";
        } else if (err.code === "API_ERROR" && err.message.includes("not existing Net API function")) {
          netApi = "up_no_handlers";
        } else {
          netApi = "error";
        }
      } else {
        netApi = "error";
        netApiError = String(err);
      }
    }

    return {
      host,
      port,
      workbenchExe,
      projectPath: projectPathInfo,
      defaultMod,
      bundledScripts,
      standaloneAddon,
      installedMods,
      netApi,
      netApiError,
    };
  }

  /**
   * Remove the standalone EnfusionMCP addon directory if it exists.
   * This prevents duplicate class name errors when handler scripts are injected
   * into a user's mod and the standalone folder is also present in the addons dir.
   */
  private cleanupStandaloneAddon(): void {
    const fallbackBase = this.config?.projectPath;
    if (!fallbackBase) return;
    const standaloneDir = join(fallbackBase, HANDLER_FOLDER);
    if (!existsSync(standaloneDir)) return;
    try {
      rmSync(standaloneDir, { recursive: true, force: true });
      logger.info(`Removed leftover standalone addon: ${standaloneDir}`);
    } catch (e) {
      logger.warn(`Failed to remove standalone addon: ${e}`);
    }
  }

  toString(): string {
    return `WorkbenchClient(${this.host}:${this.port})`;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /** Extract mode from a response object if it contains a `mode` field. */
  private extractMode(result: unknown): void {
    if (result && typeof result === "object" && "mode" in result) {
      const mode = (result as Record<string, unknown>).mode;
      if (mode === "edit") {
        this._state.mode = "edit";
      } else if (mode === "play" || mode === "game") {
        // Scripts return "game" when in play mode (WorldEditorAPI unavailable)
        this._state.mode = "play";
      }
      // "no_world_editor" and unrecognised values leave mode as-is (stays "unknown")
    }
  }

  /**
   * Recover from "not existing Net API function" errors.
   * Workbench is running but our custom handler scripts aren't compiled.
   * Installs handlers into the mod directory and waits for Workbench to
   * auto-recompile them  -  without killing the running Workbench process.
   *
   * Previous behaviour killed Workbench with taskkill, which broke other
   * tools (e.g. the Enfusion Blender plugin) that share the same NET API.
   */
  private async recoverMissingHandlers(): Promise<void> {
    if (!this.config) {
      throw new WorkbenchError("No config provided  -  cannot recover handlers.", "LAUNCH_FAILED");
    }

    // Inject into the currently-open mod (same logic as launchWorkbench).
    const recoveryGproj = this.findFallbackGproj();
    if (recoveryGproj) {
      this.installHandlerScripts(dirname(recoveryGproj), true);
      this.cleanupStandaloneAddon();
    } else {
      this.installHandlerScripts(undefined, true);
    }

    // Wait for Workbench to detect the new files and recompile scripts.
    // Workbench watches its script directories and recompiles automatically.
    // Poll with our custom EMCP_WB_Ping handler  -  it only succeeds once
    // the handler scripts are compiled and registered.
    logger.info("Handler scripts installed. Waiting for Workbench to recompile...");
    const deadline = Date.now() + HANDLER_RECOMPILE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, HANDLER_RECOMPILE_POLL_MS));
      if (await this.ping()) {
        logger.info("Handler scripts compiled and loaded.");
        return;
      }
    }

    throw new WorkbenchError(
      `Handler scripts were installed but Workbench did not recompile them within ` +
        `${HANDLER_RECOMPILE_TIMEOUT_MS / 1000}s. Try recompiling scripts manually in ` +
        `Workbench (Plugins > Reload Scripts) or restart Workbench.`,
      "LAUNCH_FAILED"
    );
  }

  /**
   * Kill any running Workbench process. Safe to call even if it isn't running.
   * Windows: taskkill. Linux: tear down the Steam/Proton launch chain + wine session.
   */
  private killWorkbench(): void {
    try {
      if (process.platform === "linux") {
        // Kill the whole Steam/Proton launch chain by exe name (reaper, pressure-vessel,
        // proton, steam.exe) + the wine session. Killing only the AppId reaper orphans
        // its children and Steam then treats the app as still running.
        // Self-match-safe: the regex [A]rmaReforger… never matches this command's own
        // text; `pkill -x wineserver` matches the process comm, not the cmdline.
        execSync(
          `pkill -f '[A]rmaReforgerWorkbenchSteamDiag' || true; pkill -x wineserver || true; ` +
            `for _ in 1 2 3 4 5 6 7 8; do pgrep -f '[A]rmaReforgerWorkbenchSteamDiag' >/dev/null || break; sleep 1; done; sleep 2`,
          { stdio: "ignore" }
        );
      } else {
        execSync(`taskkill /IM ${WORKBENCH_EXE} /F`, { stdio: "ignore" });
      }
      logger.info("Killed running Workbench process.");
    } catch {
      // Process might not be running  -  ignore
    }
  }

  private async launchWorkbench(gprojPath?: string): Promise<void> {
    // 1. Resolve the target .gproj up-front (needed for the switch-project check).
    let resolvedGproj = gprojPath || this.findFallbackGproj();

    // 2. If Workbench is already responding, decide whether to keep it or switch.
    //    Workbench only compiles the ACTIVE project, so opening a different project
    //    means closing the current instance and relaunching into the new one.
    if (await this.ping()) {
      const sameProject = !!resolvedGproj && this.currentGproj === resolvedGproj;
      if (!gprojPath || sameProject) {
        // No specific project requested, or it's already the open one  -  keep it.
        logger.info("Workbench is already running.");
        return;
      }
      logger.info(`Switching Workbench to project: ${resolvedGproj}`);
      this.killWorkbench();
      await new Promise((r) => setTimeout(r, KILL_SETTLE_MS));
    }

    // 3. Inject handler scripts into the target mod so they compile as part of it.
    //    A standalone sibling addon is never compiled unless the active project
    //    explicitly depends on it.
    if (resolvedGproj) {
      this.installHandlerScripts(dirname(resolvedGproj));
      // Remove any leftover standalone addon to prevent duplicate class errors.
      // If a previous session created {projectPath}/EnfusionMCP/ it would be
      // picked up as a sibling addon and cause compile-time class name conflicts.
      this.cleanupStandaloneAddon();
    } else {
      // No project found  -  fall back to standalone addon as last resort and open it
      // directly so its handlers at least compile (user's project won't be open).
      this.installHandlerScripts();
      const fallbackBase = this.config?.projectPath;
      if (fallbackBase) {
        const standaloneGproj = join(fallbackBase, HANDLER_FOLDER, `${HANDLER_FOLDER}.gproj`);
        if (existsSync(standaloneGproj)) {
          resolvedGproj = standaloneGproj;
        }
      }
    }

    // 3. Find executable
    const exePath = this.findWorkbenchExe();
    if (!exePath) {
      const wbPath = this.config?.workbenchPath ?? "(not configured)";
      throw new WorkbenchError(
        `Cannot find ${WORKBENCH_EXE}. Install Arma Reforger Tools from Steam, ` +
          `or set ENFUSION_WORKBENCH_PATH. Searched:\n` +
          `  - ${join(wbPath, WORKBENCH_SUBDIR, WORKBENCH_EXE)}\n` +
          `  - ${join(wbPath, WORKBENCH_EXE)}`,
        "LAUNCH_FAILED"
      );
    }

    // 5. Spawn with -gproj to skip the launcher. Under Proton/Steam the Workbench
    //    is a Windows app, so the .gproj must be a wine path (Z:/...), not a Linux one.
    const args: string[] = [];
    if (resolvedGproj) {
      const gprojArg =
        this.resolveLauncher() === "native" ? resolvedGproj : this.toWinePath(resolvedGproj);
      args.push("-gproj", gprojArg);
    }

    // Use the game install directory as CWD so Workbench finds base game addons
    // (data/ArmaReforger.gproj with GUID 58D0FB3206B6F859) via ./addons resolution.
    const cwd = this.findGameDir() || dirname(exePath);

    // Resolve how to actually launch the exe (native / Proton / Steam). On Linux
    // the Workbench is a Windows PE binary and cannot be spawned directly.
    const { command, commandArgs, env } = this.buildExeLaunch(exePath, args);
    logger.info(
      `Launching Workbench [${this.resolveLauncher()}]: ${command}` +
        `${commandArgs.length ? ` ${commandArgs.join(" ")}` : ""} (cwd: ${cwd})`
    );
    const proc = spawn(command, commandArgs, {
      detached: true,
      stdio: "ignore",
      cwd,
      env,
    });
    proc.unref();
    // Remember which project we opened so a later launch can skip a needless restart.
    this.currentGproj = resolvedGproj ?? null;

    // 5. Wait for NET API  -  track the last error type so the timeout message is actionable
    const deadline = Date.now() + LAUNCH_TIMEOUT_MS;
    let lastErrorCode: WorkbenchError["code"] | undefined;
    while (Date.now() < deadline) {
      try {
        await this.rawCall("EMCP_WB_Ping", {}, { timeout: 3000, skipAutoLaunch: true });
        this._state.connected = true;
        this._state.lastUpdated = Date.now();
        logger.info("Workbench NET API is responding.");
        return;
      } catch (err) {
        if (err instanceof WorkbenchError) {
          lastErrorCode = err.code;
          logger.debug(`Workbench poll (${err.code}): ${err.message}`);
        }
      }
      await new Promise((r) => setTimeout(r, LAUNCH_POLL_INTERVAL_MS));
    }

    // Build a specific diagnostic based on what was failing at timeout.
    // CONNECTION_REFUSED = NET API port never opened → NET API likely disabled.
    // API_ERROR = NET API is up but EMCP_WB_Ping isn't registered → handler scripts
    //             didn't compile (project has script errors, or wrong mod directory).
    let hint: string;
    if (lastErrorCode === "API_ERROR") {
      hint =
        `Workbench NET API responded but handler scripts did not load. ` +
        `Check for script compilation errors in Workbench (Script Editor). ` +
        `Fix any errors in the project's scripts so the EnfusionMCP handlers can compile, ` +
        `then try again.`;
    } else {
      hint =
        `NET API port never responded. Ensure NET API is enabled in Workbench: ` +
        `File > Options > General > Net API (checkbox must be on).`;
    }

    throw new WorkbenchError(
      `Workbench launched but did not connect within ${LAUNCH_TIMEOUT_MS / 1000}s.\n\n${hint}`,
      "LAUNCH_FAILED"
    );
  }

  private findWorkbenchExe(): string | null {
    if (!this.config) return null;
    const subPath = join(this.config.workbenchPath, WORKBENCH_SUBDIR, WORKBENCH_EXE);
    if (existsSync(subPath)) return subPath;

    const rootPath = join(this.config.workbenchPath, WORKBENCH_EXE);
    if (existsSync(rootPath)) return rootPath;

    return null;
  }

  /** Resolve the effective launcher mode ("auto" → platform default). */
  private resolveLauncher(): "native" | "proton" | "steam" {
    const mode = this.config?.launcher ?? "auto";
    if (mode === "native" || mode === "proton" || mode === "steam") return mode;
    // auto: a Windows PE binary can't run natively on Linux. Launch via Steam so the
    // sniper runtime + Proton are applied (the proven path); other platforms run native.
    return process.platform === "linux" ? "steam" : "native";
  }

  /** Translate a Linux path to the wine `Z:` drive (Workbench under Proton needs it). */
  private toWinePath(p: string): string {
    if (/^[A-Za-z]:/.test(p)) return p; // already a wine path
    return "Z:" + p;
  }

  /** Locate the Steam install root (holds steamapps/). */
  private findSteamRoot(): string | null {
    if (this.config?.steamRoot && existsSync(this.config.steamRoot)) {
      return this.config.steamRoot;
    }
    const home = homedir();
    const candidates = [
      join(home, ".local", "share", "Steam"),
      join(home, ".steam", "steam"),
      join(home, ".steam", "root"),
      join(home, ".var", "app", "com.valvesoftware.Steam", "data", "Steam"), // Flatpak
    ];
    for (const c of candidates) {
      if (existsSync(join(c, "steamapps"))) return c;
    }
    return null;
  }

  /** Locate a Proton `proton` run script, preferring Experimental then newest. */
  private findProton(steamRoot: string | null): string | null {
    if (this.config?.protonPath && existsSync(this.config.protonPath)) {
      return this.config.protonPath;
    }
    if (!steamRoot) return null;
    const commonDir = join(steamRoot, "steamapps", "common");
    try {
      const protonDirs = readdirSync(commonDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && /^Proton/i.test(d.name))
        .map((d) => d.name)
        // Prefer "Proton - Experimental", then higher-named versions (rough but adequate).
        .sort((a, b) => {
          const ea = /Experimental/i.test(a) ? 1 : 0;
          const eb = /Experimental/i.test(b) ? 1 : 0;
          if (ea !== eb) return eb - ea;
          return b.localeCompare(a, undefined, { numeric: true });
        });
      for (const name of protonDirs) {
        const p = join(commonDir, name, "proton");
        if (existsSync(p)) return p;
      }
    } catch { /* ignore */ }
    return null;
  }

  /**
   * Build the actual spawn command for the Workbench exe based on the launcher mode.
   * - native: run the exe directly (Windows, or an externally-wrapped exe).
   * - proton: `proton run <exe> [args]` with the Steam compat env (Linux).
   * - steam:  `steam -applaunch <appid> [args]` (Steam applies its own runtime).
   */
  private buildExeLaunch(
    exePath: string,
    args: string[]
  ): { command: string; commandArgs: string[]; env: NodeJS.ProcessEnv } {
    const launcher = this.resolveLauncher();

    if (launcher === "native") {
      return { command: exePath, commandArgs: args, env: process.env };
    }

    const appId = this.config?.steamAppId ?? "1874910";

    if (launcher === "steam") {
      // Steam forwards trailing args to the launched app, so -gproj still applies.
      return { command: "steam", commandArgs: ["-applaunch", appId, ...args], env: process.env };
    }

    // proton
    const steamRoot = this.findSteamRoot();
    const proton = this.findProton(steamRoot);
    if (!proton || !steamRoot) {
      const missing = !proton ? "a Proton install" : "the Steam root";
      throw new WorkbenchError(
        `Proton launcher selected but could not locate ${missing}. ` +
          `Set ENFUSION_PROTON_PATH and/or ENFUSION_STEAM_ROOT, or switch to ` +
          `ENFUSION_WB_LAUNCHER=steam (launch via the Steam client instead).`,
        "LAUNCH_FAILED"
      );
    }
    const compatData =
      this.config?.steamCompatDataPath ||
      join(steamRoot, "steamapps", "compatdata", appId);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      STEAM_COMPAT_DATA_PATH: compatData,
      STEAM_COMPAT_CLIENT_INSTALL_PATH: steamRoot,
    };
    return { command: proton, commandArgs: ["run", exePath, ...args], env };
  }

  /**
   * Find a .gproj to pass via -gproj so Workbench skips the launcher.
   * Prefers config.defaultMod if set; otherwise picks first addon found.
   * Scans for any .gproj in each addon folder (name need not match folder).
   */
  private findFallbackGproj(): string | null {
    const findGprojInDir = (dir: string): string | null => {
      try {
        for (const f of readdirSync(dir, { withFileTypes: true })) {
          if (!f.isDirectory() && f.name.endsWith(".gproj")) {
            return join(dir, f.name);
          }
        }
      } catch { /* ignore */ }
      return null;
    };

    try {
      const addonsDir = this.config?.projectPath;
      if (!addonsDir || !existsSync(addonsDir)) return null;

      // Prefer the configured default mod over alphabetical first-pick
      const preferred = this.config?.defaultMod;
      if (preferred) {
        const gprojPath = findGprojInDir(join(addonsDir, preferred));
        if (gprojPath) {
          logger.info(`Using defaultMod gproj to skip launcher: ${gprojPath}`);
          return gprojPath;
        }
      }

      for (const entry of readdirSync(addonsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const gprojPath = findGprojInDir(join(addonsDir, entry.name));
        if (gprojPath) {
          logger.info(`Using fallback gproj to skip launcher: ${gprojPath}`);
          return gprojPath;
        }
      }
    } catch { /* ignore */ }
    return null;
  }

  /**
   * Derive the Arma Reforger game install directory.
   * Checks ENFUSION_GAME_PATH env var first, then walks up from workbenchPath.
   * workbenchPath may point to the Tools root OR the Workbench subdirectory,
   * so we try both one and two levels up.
   */
  private findGameDir(): string | null {
    // Explicit env var takes priority
    const envGamePath = process.env.ENFUSION_GAME_PATH;
    if (envGamePath && existsSync(join(envGamePath, "addons"))) {
      logger.info(`Using game directory from ENFUSION_GAME_PATH: ${envGamePath}`);
      return envGamePath;
    }

    if (!this.config) return null;
    const toolsDir = this.config.workbenchPath;
    // workbenchPath may be "Arma Reforger Tools" or "Arma Reforger Tools\Workbench"
    const candidates = [
      resolve(toolsDir, "..", "Arma Reforger"),
      resolve(toolsDir, "..", "ArmaReforger"),
      resolve(toolsDir, "..", "..", "Arma Reforger"),
      resolve(toolsDir, "..", "..", "ArmaReforger"),
    ];
    for (const candidate of candidates) {
      if (existsSync(join(candidate, "addons"))) {
        logger.info(`Using game directory as CWD: ${candidate}`);
        return candidate;
      }
    }
    logger.warn("Could not find Arma Reforger game directory. Workbench may fail to resolve base game addon.");
    return null;
  }

  /**
   * Copy handler scripts into a mod directory so they compile as part of that mod.
   * If no modDir given, installs to default project path (standalone, less useful).
   */
  private installHandlerScripts(modDir?: string, force = false): void {
    const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const bundledDir = join(packageRoot, "mod", "Scripts", "WorkbenchGame", HANDLER_FOLDER);
    if (!existsSync(bundledDir)) {
      logger.warn("Bundled handler scripts not found in package.");
      return;
    }

    const fallbackBase = this.config?.projectPath;
    if (!modDir && !fallbackBase) {
      logger.warn("No modDir or projectPath configured  -  cannot install handler scripts.");
      return;
    }
    const isFallback = !modDir;
    const targetBase = modDir || join(fallbackBase!, HANDLER_FOLDER);
    const targetScriptsDir = join(targetBase, "Scripts", "WorkbenchGame", HANDLER_FOLDER);

    // Already installed? Skip unless force-reinstalling (e.g. recovery after missing handlers)
    if (!force && existsSync(join(targetScriptsDir, "EMCP_WB_Ping.c"))) {
      return;
    }


    logger.info(`Installing handler scripts to ${targetScriptsDir}`);
    mkdirSync(targetScriptsDir, { recursive: true });

    const files = readdirSync(bundledDir).filter((f) => f.endsWith(".c"));
    try {
      for (const file of files) {
        copyFileSync(join(bundledDir, file), join(targetScriptsDir, file));
      }
    } catch (e) {
      // Partial installation  -  clean up to avoid broken state on next attempt
      logger.error(`Failed to install handler scripts, rolling back: ${e}`);
      try {
        rmSync(targetScriptsDir, { recursive: true, force: true });
      } catch { /* best-effort cleanup */ }
      throw e;
    }

    logger.info(`Installed ${files.length} handler scripts.`);

    // When using the standalone fallback path, also write a .gproj so Workbench
    // treats the directory as a loadable addon and compiles the handler scripts.
    if (isFallback) {
      const gprojPath = join(targetBase, `${HANDLER_FOLDER}.gproj`);
      if (!existsSync(gprojPath)) {
        const gprojContent = generateGproj({ name: HANDLER_FOLDER, title: "EnfusionMCP Handlers" });
        writeFileSync(gprojPath, gprojContent, "utf-8");
        logger.info(`Created standalone addon .gproj at ${gprojPath}`);
      }
    }
  }

  /**
   * Raw TCP call  -  no auto-launch, no retry.
   */
  private rawCall<T = Record<string, unknown>>(
    apiFunc: string,
    params: Record<string, unknown> = {},
    options: WorkbenchCallOptions = {}
  ): Promise<T> {
    const timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    const requestBuf = encodeRequest(this.clientId, apiFunc, params);

    return new Promise<T>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let settled = false;

      const socket = new Socket();

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          socket.destroy();
          reject(
            new WorkbenchError(
              `Workbench call "${apiFunc}" timed out after ${timeout}ms`,
              "TIMEOUT"
            )
          );
        }
      }, timeout);

      const cleanup = () => {
        clearTimeout(timer);
        socket.removeAllListeners();
      };

      socket.on("error", (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ECONNREFUSED") {
          reject(
            new WorkbenchError(
              `Cannot connect to Workbench at ${this.host}:${this.port}.`,
              "CONNECTION_REFUSED"
            )
          );
        } else {
          reject(
            new WorkbenchError(
              `Connection error: ${err.message}`,
              "PROTOCOL_ERROR"
            )
          );
        }
      });

      socket.on("data", (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_RESPONSE_SIZE) {
          if (!settled) {
            settled = true;
            cleanup();
            socket.destroy();
            reject(
              new WorkbenchError(
                `Response for "${apiFunc}" exceeded ${MAX_RESPONSE_SIZE} bytes  -  possible malformed data`,
                "PROTOCOL_ERROR"
              )
            );
          }
          return;
        }
        chunks.push(chunk);
      });

      socket.on("end", () => {
        if (settled) return;
        settled = true;
        cleanup();

        const responseBuf = Buffer.concat(chunks);
        if (responseBuf.length === 0) {
          reject(
            new WorkbenchError(
              `Empty response from Workbench for "${apiFunc}"  -  connection closed without data`,
              "PROTOCOL_ERROR"
            )
          );
          return;
        }

        try {
          const result = decodeResponse<T>(responseBuf);
          logger.debug(`Workbench response for "${apiFunc}":`, result);
          resolve(result);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const isApiError = errMsg.startsWith("Workbench error:");
          reject(
            new WorkbenchError(
              isApiError ? errMsg : `Failed to decode response for "${apiFunc}": ${errMsg}`,
              isApiError ? "API_ERROR" : "PROTOCOL_ERROR"
            )
          );
        }
      });

      socket.on("close", (hadError) => {
        if (settled) return;
        // close fired without end  -  connection dropped unexpectedly
        settled = true;
        cleanup();

        if (hadError) {
          reject(
            new WorkbenchError(
              `Connection to Workbench closed with error for "${apiFunc}"`,
              "PROTOCOL_ERROR"
            )
          );
          return;
        }

        // No end event + no error = unusual. Try to decode what we have.
        const responseBuf = Buffer.concat(chunks);
        if (responseBuf.length === 0) {
          reject(
            new WorkbenchError(
              `Connection closed without response for "${apiFunc}"`,
              "PROTOCOL_ERROR"
            )
          );
          return;
        }

        try {
          const result = decodeResponse<T>(responseBuf);
          resolve(result);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          const isApiError = errMsg.startsWith("Workbench error:");
          reject(
            new WorkbenchError(
              isApiError ? errMsg : `Failed to decode response for "${apiFunc}": ${errMsg}`,
              isApiError ? "API_ERROR" : "PROTOCOL_ERROR"
            )
          );
        }
      });

      socket.connect(this.port, this.host, () => {
        logger.debug(
          `Connected to Workbench at ${this.host}:${this.port}, calling "${apiFunc}"`
        );
        socket.end(requestBuf);
      });
    });
  }
}

