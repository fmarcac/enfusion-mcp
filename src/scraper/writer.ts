import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { logger } from "../utils/logger.js";
import type {
  ClassInfo,
  GroupInfo,
  HierarchyNode,
  WikiPage,
} from "../index/types.js";

export interface ScrapeOutput {
  enfusionClasses: ClassInfo[];
  armaClasses: ClassInfo[];
  hierarchy: HierarchyNode[];
  groups: GroupInfo[];
  wikiPages: WikiPage[];
}

function writeJson(filePath: string, data: unknown): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
  logger.info(`Wrote ${filePath}`);
}

/**
 * Write a class list, but PRESERVE the existing file when the scrape yielded
 * nothing. Arma Reforger 1.7 dropped the separate Enfusion engine API docs
 * (merged only the game API into ArmaReforgerScriptAPIPublic.zip), so a re-scrape
 * produces 0 enfusion classes. The engine API (BaseRplComponent, IEntity, math
 * types, …) is stable across versions, so we keep the last good copy rather than
 * wiping ~800 still-valid classes.
 */
function writeClassesPreservingEmpty(filePath: string, scraped: ClassInfo[], label: string): number {
  if (scraped.length > 0) {
    writeJson(filePath, scraped);
    return scraped.length;
  }
  if (existsSync(filePath)) {
    try {
      const existing = JSON.parse(readFileSync(filePath, "utf-8")) as ClassInfo[];
      logger.warn(
        `No ${label} classes scraped  -  preserving ${existing.length} existing entries (likely a 1.7 combined/missing docs zip).`
      );
      return existing.length;
    } catch {
      // fall through to write empty
    }
  }
  writeJson(filePath, scraped);
  return 0;
}

export function writeOutput(dataDir: string, output: ScrapeOutput): void {
  const apiDir = resolve(dataDir, "api");
  const wikiDir = resolve(dataDir, "wiki");

  const enfusionCount = writeClassesPreservingEmpty(
    resolve(apiDir, "enfusion-classes.json"),
    output.enfusionClasses,
    "enfusion"
  );
  const armaCount = writeClassesPreservingEmpty(
    resolve(apiDir, "arma-classes.json"),
    output.armaClasses,
    "arma"
  );
  // hierarchy/groups: only overwrite when we actually scraped some (don't wipe on empty)
  if (output.hierarchy.length > 0) writeJson(resolve(apiDir, "hierarchy.json"), output.hierarchy);
  if (output.groups.length > 0) writeJson(resolve(apiDir, "groups.json"), output.groups);
  // Merge wiki pages: preserve existing BI wiki pages, replace only Doxygen-sourced pages
  const pagesPath = resolve(wikiDir, "pages.json");
  let existingPages: WikiPage[] = [];
  if (existsSync(pagesPath)) {
    try {
      existingPages = JSON.parse(readFileSync(pagesPath, "utf-8")) as WikiPage[];
    } catch {
      // Corrupted file  -  will be overwritten
    }
  }
  // Keep pages from sources NOT in the current scrape output
  const scrapedSources = new Set(output.wikiPages.map((p) => p.source));
  const preservedPages = existingPages.filter((p) => !scrapedSources.has(p.source));
  const mergedPages = [...preservedPages, ...output.wikiPages];
  writeJson(pagesPath, mergedPages);

  logger.info(
    `Scrape complete: ${enfusionCount} enfusion classes, ${armaCount} arma classes, ${output.hierarchy.length} hierarchy nodes (scraped), ${output.groups.length} groups (scraped), ${mergedPages.length} wiki pages (${output.wikiPages.length} from Doxygen + ${preservedPages.length} preserved)`
  );
}
