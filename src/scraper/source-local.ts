import AdmZip from "adm-zip";
import { resolve, basename } from "node:path";
import { existsSync } from "node:fs";
import { logger } from "../utils/logger.js";

export interface HtmlEntry {
  filename: string;
  html: string;
}

const ZIP_FILES = {
  enfusion: "EnfusionScriptAPIPublic.zip",
  arma: "ArmaReforgerScriptAPIPublic.zip",
} as const;

export function getZipPath(
  workbenchPath: string,
  source: "enfusion" | "arma"
): string {
  return resolve(workbenchPath, "Workbench", "docs", ZIP_FILES[source]);
}

/**
 * Iterate HTML files from a local Workbench docs zip.
 * Yields {filename, html} for each HTML file matching the given pattern.
 *
 * Filenames are matched by basename (last path segment), so this is agnostic
 * to the zip's internal directory layout. Pre-1.7 zips placed pages at
 * `<Prefix>/annotated.html`; the 1.7 combined zip nests them under
 * `<Prefix>/html/...`. Basename matching handles both.
 */
export function* readHtmlFromZip(
  workbenchPath: string,
  source: "enfusion" | "arma",
  pattern?: RegExp
): Generator<HtmlEntry> {
  const zipPath = getZipPath(workbenchPath, source);

  if (!existsSync(zipPath)) {
    logger.warn(`Docs zip not found (skipping ${source}): ${zipPath}`);
    return;
  }

  logger.info(`Reading from ${zipPath}`);
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();

  let count = 0;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (!entry.entryName.endsWith(".html")) continue;

    // Match on basename so the internal directory depth doesn't matter.
    const filename = basename(entry.entryName);

    // Apply pattern filter if provided
    if (pattern && !pattern.test(filename)) continue;

    const html = entry.getData().toString("utf-8");
    count++;
    yield { filename, html };
  }

  logger.info(`Read ${count} HTML files from ${ZIP_FILES[source]}`);
}

/**
 * Read a specific file from the zip by basename (e.g. "annotated.html").
 * Layout-agnostic: searches all entries for a matching basename.
 */
export function readFileFromZip(
  workbenchPath: string,
  source: "enfusion" | "arma",
  filename: string
): string | null {
  const zipPath = getZipPath(workbenchPath, source);
  if (!existsSync(zipPath)) return null;

  const zip = new AdmZip(zipPath);
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    if (basename(entry.entryName) === filename) {
      return entry.getData().toString("utf-8");
    }
  }
  return null;
}
