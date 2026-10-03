import AdmZip from "adm-zip";
import { resolve, basename, join } from "node:path";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { logger } from "../utils/logger.js";

export interface HtmlEntry {
  filename: string;
  html: string;
}

/**
 * Where each API's docs live under `<Tools>/Workbench/docs`, newest layout first.
 *
 * Up to 1.7 the Tools shipped zips. 1.8 ships the same Doxygen output UNPACKED, as
 * `ArmaReforgerScriptAPIPublic/html/` and `EnfusionScriptAPI/html/` (note: no
 * "Public" on the Enfusion one). A zip-only reader finds nothing on 1.8 and the
 * scrape silently keeps the previous index, which is how the 1.7 index outlived
 * the 1.8 update.
 */
const CANDIDATES = {
  enfusion: ["EnfusionScriptAPI", "EnfusionScriptAPIPublic", "EnfusionScriptAPIPublic.zip"],
  arma: ["ArmaReforgerScriptAPIPublic", "ArmaReforgerScriptAPIPublic.zip"],
} as const;

type Source = "enfusion" | "arma";

/** The docs location actually present for this source, or null. */
export function getDocsPath(workbenchPath: string, source: Source): string | null {
  for (const name of CANDIDATES[source]) {
    const p = resolve(workbenchPath, "Workbench", "docs", name);
    if (existsSync(p)) return p;
  }
  return null;
}

/** Every .html under a directory, shallowest first so `html/annotated.html` beats a nested copy. */
function listHtml(dir: string): string[] {
  const out: string[] = [];
  let level = [dir];
  while (level.length) {
    const next: string[] = [];
    for (const d of level) {
      for (const name of readdirSync(d).sort()) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) next.push(p);
        else if (name.endsWith(".html")) out.push(p);
      }
    }
    level = next;
  }
  return out;
}

/**
 * Iterate HTML files from the local Workbench docs, zip or directory.
 *
 * Filenames are matched by basename (last path segment), so this is agnostic to
 * the internal layout: pre-1.7 zips used `<Prefix>/annotated.html`, 1.7 and 1.8
 * nest pages under `<Prefix>/html/...`.
 */
export function* readHtmlFromZip(
  workbenchPath: string,
  source: Source,
  pattern?: RegExp
): Generator<HtmlEntry> {
  const docs = getDocsPath(workbenchPath, source);
  if (!docs) {
    logger.warn(`Docs not found (skipping ${source}) under ${resolve(workbenchPath, "Workbench", "docs")}`);
    return;
  }

  logger.info(`Reading from ${docs}`);
  let count = 0;

  if (docs.endsWith(".zip")) {
    for (const entry of new AdmZip(docs).getEntries()) {
      if (entry.isDirectory || !entry.entryName.endsWith(".html")) continue;
      const filename = basename(entry.entryName);
      if (pattern && !pattern.test(filename)) continue;
      count++;
      yield { filename, html: entry.getData().toString("utf-8") };
    }
  } else {
    for (const p of listHtml(docs)) {
      const filename = basename(p);
      if (pattern && !pattern.test(filename)) continue;
      count++;
      yield { filename, html: readFileSync(p, "utf-8") };
    }
  }

  logger.info(`Read ${count} HTML files from ${basename(docs)}`);
}

/** Read one file by basename (e.g. "annotated.html"), zip or directory. */
export function readFileFromZip(
  workbenchPath: string,
  source: Source,
  filename: string
): string | null {
  const docs = getDocsPath(workbenchPath, source);
  if (!docs) return null;

  if (docs.endsWith(".zip")) {
    for (const entry of new AdmZip(docs).getEntries()) {
      if (!entry.isDirectory && basename(entry.entryName) === filename) {
        return entry.getData().toString("utf-8");
      }
    }
    return null;
  }

  const hit = listHtml(docs).find((p) => basename(p) === filename);
  return hit ? readFileSync(hit, "utf-8") : null;
}
