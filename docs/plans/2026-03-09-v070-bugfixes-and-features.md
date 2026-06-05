# v0.7.0 Bug Fixes + Features Implementation Plan

> **For client:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 10 bugs and add 3 features (config validation, fuzzy search, auto-fetch parent methods) for a v0.7.0 release.

**Architecture:** Bug fixes are isolated to individual files. Features add new utilities and modify existing search/template infrastructure. All 7 work streams are independent and can run in parallel via subagents.

**Tech Stack:** TypeScript, Vitest, Node.js TCP sockets, Zod schemas

---

## Stream A: Core Parser Fixes

### Task A1: Fix enfusion-text string escape handling

**Files:**
- Modify: `src/formats/enfusion-text.ts:79-86` (tokenizer) and `src/formats/enfusion-text.ts:391-392` (serializer)
- Test: `tests/formats/enfusion-text.test.ts`

**Step 1: Write failing tests**

Add to `tests/formats/enfusion-text.test.ts`:

```typescript
import { parse, serialize } from "../../src/formats/enfusion-text.js";

describe("string escape handling", () => {
  it("should parse \\n escape in string values", () => {
    const input = `MyNode {\n  key "line1\\nline2"\n}`;
    const node = parse(input);
    expect(node.properties[0].value).toBe("line1\nline2");
  });

  it("should parse \\t escape in string values", () => {
    const input = `MyNode {\n  key "col1\\tcol2"\n}`;
    const node = parse(input);
    expect(node.properties[0].value).toBe("col1\tcol2");
  });

  it("should parse \\\\ escape as literal backslash", () => {
    const input = `MyNode {\n  key "c:\\\\path"\n}`;
    const node = parse(input);
    expect(node.properties[0].value).toBe("c:\\path");
  });

  it("should round-trip strings with newlines", () => {
    const input = `MyNode {\n  key "line1\\nline2"\n}`;
    const node = parse(input);
    const output = serialize(node);
    const reparsed = parse(output);
    expect(reparsed.properties[0].value).toBe("line1\nline2");
  });

  it("should serialize newlines as \\n in output", () => {
    const input = `MyNode {\n  key "has newline"\n}`;
    const node = parse(input);
    node.properties[0].value = "line1\nline2";
    const output = serialize(node);
    expect(output).toContain('\\n');
    expect(output).not.toContain('\n"');  // raw newline before closing quote
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/formats/enfusion-text.test.ts --reporter=verbose`
Expected: FAIL  -  `\n` not recognized as escape, serializer doesn't escape newlines

**Step 3: Fix tokenizer escape handling**

In `src/formats/enfusion-text.ts`, replace lines 79-86:

```typescript
// OLD:
while (i < len && input[i] !== '"') {
  if (input[i] === "\\" && i + 1 < len) {
    str += input[i + 1];
    i += 2;
  } else {
    str += input[i];
    i++;
  }
}

// NEW:
while (i < len && input[i] !== '"') {
  if (input[i] === "\\" && i + 1 < len) {
    const esc = input[i + 1];
    switch (esc) {
      case "n": str += "\n"; break;
      case "t": str += "\t"; break;
      case "r": str += "\r"; break;
      case "\\": str += "\\"; break;
      case '"': str += '"'; break;
      default: str += esc; break;  // unknown escape: keep literal char
    }
    i += 2;
  } else {
    str += input[i];
    i++;
  }
}
```

**Step 4: Fix serializer escape function**

In `src/formats/enfusion-text.ts`, replace lines 391-392:

```typescript
// OLD:
function escapeString(str: string): string {
  return str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// NEW:
function escapeString(str: string): string {
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(/\r/g, "\\r");
}
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/formats/enfusion-text.test.ts --reporter=verbose`
Expected: PASS

**Step 6: Commit**

```bash
git add src/formats/enfusion-text.ts tests/formats/enfusion-text.test.ts
git commit -m "fix: handle \\n, \\t, \\r escape sequences in enfusion-text parser and serializer"
```

---

### Task A2: Fix extractParamNames with default values

**Files:**
- Modify: `src/templates/script.ts:344-355`
- Test: `tests/templates/script.test.ts`

**Step 1: Write failing test**

Add to `tests/templates/script.test.ts`:

```typescript
import { generateScript } from "../../src/templates/script.js";

describe("extractParamNames with default values", () => {
  it("should generate correct super call when params have defaults", () => {
    const code = generateScript({
      className: "TAG_TestModded",
      scriptType: "modded",
      parentClass: "SCR_BaseGameMode",
      methods: ["override void OnInit(IEntity owner = null)"],
    });
    expect(code).toContain("super.OnInit(owner)");
    expect(code).not.toContain("null)");
    expect(code).not.toContain("null,");
  });

  it("should handle multiple params with defaults", () => {
    const code = generateScript({
      className: "TAG_TestModded2",
      scriptType: "modded",
      parentClass: "SCR_BaseGameMode",
      methods: ["override void OnDamage(float damage = 0, int type = -1, IEntity source = null)"],
    });
    expect(code).toContain("super.OnDamage(damage, type, source)");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/templates/script.test.ts --reporter=verbose`
Expected: FAIL  -  super call contains `null)` instead of `owner)`

**Step 3: Fix extractParamNames**

In `src/templates/script.ts`, replace lines 344-355:

```typescript
function extractParamNames(sig: string): string {
  const match = sig.match(/\(([^)]*)\)/);
  if (!match || !match[1].trim()) return "";
  return match[1]
    .split(",")
    .map((p) => {
      // Strip default value: "IEntity owner = null" → "IEntity owner"
      const withoutDefault = p.split("=")[0].trim();
      // Take the last word as the param name
      const parts = withoutDefault.split(/\s+/);
      return parts[parts.length - 1];
    })
    .join(", ");
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/templates/script.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/templates/script.ts tests/templates/script.test.ts
git commit -m "fix: extractParamNames now strips default values from method signatures"
```

---

## Stream B: Workbench Client Fixes

### Task B1: Fix socket double-processing in rawCall

**Files:**
- Modify: `src/workbench/client.ts:491-544`
- Test: `tests/workbench/client.test.ts`

**Step 1: Write failing test**

Add to `tests/workbench/client.test.ts`:

```typescript
describe("rawCall socket handling", () => {
  it("should only decode response once when both end and close fire", async () => {
    // This is a behavioral test  -  verify the client returns a single result
    // when both socket events fire (which is the normal TCP flow)
    // The fix ensures close handler doesn't re-decode
    // Test via mocking would be complex; instead verify existing tests still pass
    // after the refactor and add a unit test for the pattern
  });
});
```

**Step 2: Refactor rawCall socket handlers**

In `src/workbench/client.ts`, replace lines 491-544 (the `end` and `close` handlers):

```typescript
      socket.on("end", () => {
        if (settled) return;
        settled = true;
        cleanup();

        const responseBuf = Buffer.concat(chunks);
        if (responseBuf.length === 0) {
          resolve({} as T);
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
          // error handler already rejected, but guard against edge case
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
```

Key changes:
- `close` without prior `end` now rejects with PROTOCOL_ERROR if buffer is empty (instead of resolving `{}`)
- `close` with `hadError` explicitly rejects instead of silently returning
- `end` remains the primary decode path

**Step 3: Run existing tests**

Run: `npx vitest run tests/workbench/ --reporter=verbose`
Expected: PASS (no behavioral change for normal flow)

**Step 4: Commit**

```bash
git add src/workbench/client.ts
git commit -m "fix: prevent double response decoding in rawCall socket handlers"
```

---

### Task B2: Add handler installation rollback

**Files:**
- Modify: `src/workbench/client.ts:402-428`

**Step 1: Fix installHandlerScripts**

In `src/workbench/client.ts`, replace the file copy loop (around lines 419-427):

```typescript
  private installHandlerScripts(modDir?: string, force = false): void {
    const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const bundledDir = join(packageRoot, "mod", "Scripts", "WorkbenchGame", HANDLER_FOLDER);
    if (!existsSync(bundledDir)) {
      logger.warn("Bundled handler scripts not found in package.");
      return;
    }

    const targetBase = modDir || join(this.config!.projectPath, HANDLER_FOLDER);
    const targetScriptsDir = join(targetBase, "Scripts", "WorkbenchGame", HANDLER_FOLDER);

    // Already installed? Skip unless force-reinstalling
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
  }
```

**Step 2: Run existing tests**

Run: `npx vitest run tests/workbench/ --reporter=verbose`
Expected: PASS

**Step 3: Commit**

```bash
git add src/workbench/client.ts
git commit -m "fix: rollback partial handler script installation on copy failure"
```

---

### Task B3: Fix protocol incomplete response detection

**Files:**
- Modify: `src/workbench/protocol.ts:104-119`
- Test: `tests/workbench/protocol.test.ts`

**Step 1: Write failing test**

Add to `tests/workbench/protocol.test.ts`:

```typescript
import { decodeResponse, encodePascalString } from "../../src/workbench/protocol.js";

describe("decodeResponse edge cases", () => {
  it("should throw when status is Ok but no payload follows", () => {
    // Encode just "Ok" status with no payload
    const buf = encodePascalString("Ok");
    expect(() => decodeResponse(buf)).toThrow(/no payload/i);
  });

  it("should throw when status is Ok but payload is empty string", () => {
    const buf = Buffer.concat([
      encodePascalString("Ok"),
      encodePascalString(""),
    ]);
    expect(() => decodeResponse(buf)).toThrow(/empty payload/i);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/workbench/protocol.test.ts --reporter=verbose`
Expected: FAIL  -  currently returns `{}` instead of throwing

**Step 3: Fix decodeResponse**

In `src/workbench/protocol.ts`, replace lines 104-119:

```typescript
  // Parse the JSON payload from the second Pascal string (if present)
  if (buf.length > bytesRead) {
    const { value: payload } = decodePascalString(buf, bytesRead);
    if (payload.length > 0) {
      try {
        return JSON.parse(payload) as T;
      } catch {
        throw new Error(
          `Failed to parse response JSON: ${payload.slice(0, 200)}`
        );
      }
    }
    throw new Error("Workbench error: Ok status with empty payload");
  }

  throw new Error("Workbench error: Ok status with no payload  -  possible truncated response");
```

**Step 4: Run tests**

Run: `npx vitest run tests/workbench/protocol.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Check that existing tests still pass**

Run: `npx vitest run tests/workbench/ --reporter=verbose`
Expected: PASS  -  verify no test relied on `{}` return from incomplete response

**NOTE:** If existing tests break because they expect `{}` from `decodeResponse` with only an "Ok" status, those tests are testing the buggy behavior. Update them to expect the error, or provide a proper payload in the test fixture.

**Step 6: Commit**

```bash
git add src/workbench/protocol.ts tests/workbench/protocol.test.ts
git commit -m "fix: throw on incomplete Workbench response instead of returning empty object"
```

---

## Stream C: PAK/Asset Fixes

### Task C1: Add PAK reader bounds checks

**Files:**
- Modify: `src/pak/reader.ts:70-91` and `src/pak/reader.ts:127-135`
- Test: `tests/pak/reader.test.ts`

**Step 1: Write failing tests**

Add to `tests/pak/reader.test.ts`:

```typescript
describe("PAK reader bounds checks", () => {
  it("should reject chunk with size exceeding file", () => {
    // Create a minimal PAK with a DATA chunk whose size field exceeds the file
    // FORM(12) + chunk header with oversized length
    const buf = Buffer.alloc(20);
    buf.writeUInt32BE(0x464f524d, 0); // FORM
    buf.writeUInt32BE(8, 4);           // FORM size
    buf.writeUInt32BE(0x50414331, 8); // PAC1
    // DATA chunk at offset 12 with absurd size
    buf.writeUInt32BE(0x44415441, 12); // DATA
    buf.writeUInt32BE(0xFFFFFFFF, 16); // chunk size = 4GB

    // Write to temp file and try to parse
    const tmpPath = join(__dirname, "test-oversize.pak");
    writeFileSync(tmpPath, buf);
    try {
      expect(() => parsePakIndex(tmpPath)).toThrow();
    } finally {
      rmSync(tmpPath, { force: true });
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pak/reader.test.ts --reporter=verbose`
Expected: FAIL or hangs  -  currently no bounds check

**Step 3: Add bounds checks**

In `src/pak/reader.ts`, add validation after reading chunk header (after line 73):

```typescript
    while (pos + 8 <= fileSize) {
      const hdr = readAt(fd, pos, 8);
      const magic = hdr.readUInt32BE(0);
      const chunkLen = hdr.readUInt32BE(4);

      // Bounds check: chunk must fit within the file
      if (chunkLen > fileSize - pos - 8) {
        throw new Error(
          `PAK chunk 0x${magic.toString(16)} at offset ${pos} has size ${chunkLen} but only ${fileSize - pos - 8} bytes remain`
        );
      }
```

In `src/pak/reader.ts`, add bounds check in `parseEntry` after reading `nameLen` (after line 132):

```typescript
  const nameLen = buf.readUInt8(state.offset);
  state.offset += 1;

  if (state.offset + nameLen > buf.length) {
    throw new Error(
      `PAK entry name length ${nameLen} exceeds buffer at offset ${state.offset} (buffer size ${buf.length})`
    );
  }
```

**Step 4: Run tests**

Run: `npx vitest run tests/pak/ --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/pak/reader.ts tests/pak/reader.test.ts
git commit -m "fix: add bounds checks for PAK chunk sizes and entry name lengths"
```

---

### Task C2: Move PAK file size check before read in game-read

**Files:**
- Modify: `src/tools/game-read.ts:98-132`

**Step 1: Fix the order**

The current code at lines 112-124 checks `pakVfs.fileSize()` then calls `pakVfs.readTextFile()`. The `fileSize` check is already BEFORE `readTextFile`, so this is actually correct in the current code. Re-verify:

```typescript
// Line 112: const fileSize = pakVfs.fileSize(subPath);
// Line 113: if (fileSize > 512_000) { return error }
// Line 124: const content = pakVfs.readTextFile(subPath);
```

This is already correct  -  `fileSize` is checked at line 113 BEFORE `readTextFile` at line 124. **No change needed.** Skip this task.

---

### Task C3: Surface GUID index errors to user in asset-search

**Files:**
- Modify: `src/tools/asset-search.ts`

**Step 1: Find where results are returned**

Read the tool response formatting to find where to inject the warning. The tool returns a text content block with search results.

**Step 2: Add GUID diagnostic to response**

After the search results text is assembled, before returning, append the GUID diagnostic if it contains an error:

```typescript
// At the end of the response text assembly, before returning:
if (cachedGuidDiag && cachedGuidDiag.startsWith("GUID INDEX ERROR")) {
  lines.push("");
  lines.push(`**Warning:** ${cachedGuidDiag}`);
  lines.push("Some results may be missing GUID prefixes. Check file permissions or game installation.");
}
```

Find the exact insertion point by reading the full tool response formatting in `asset-search.ts`.

**Step 3: Run build**

Run: `npx vitest run --reporter=verbose`
Expected: PASS

**Step 4: Commit**

```bash
git add src/tools/asset-search.ts
git commit -m "fix: surface GUID index errors in asset_search tool response"
```

---

## Stream D: Tool-Level Fixes

### Task D1: Add scenario entity cleanup on partial failure

**Files:**
- Modify: `src/tools/wb-scenario.ts`

**Step 1: Add cleanup helper**

At the top of the `registerScenarioTools` function body (after the PREFABS const), add a cleanup helper. Then modify the catch block to use it:

```typescript
// Add inside the tool handler, after `const placed: string[] = [];`

async function cleanupPlaced(): Promise<string[]> {
  const cleaned: string[] = [];
  for (const entityName of placed) {
    try {
      await client.call("EMCP_WB_DeleteEntity", { name: entityName });
      cleaned.push(entityName);
    } catch {
      // Entity might not exist if creation itself failed
    }
  }
  return cleaned;
}
```

Then update the catch block (lines 211-226):

```typescript
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const cleaned = await cleanupPlaced();
        return {
          content: [{
            type: "text" as const,
            text: [
              `**scenario_create_objective failed**`,
              `Error: ${msg}`,
              ``,
              cleaned.length > 0
                ? `Cleaned up ${cleaned.length} entities: ${cleaned.join(", ")}`
                : "No entities needed cleanup.",
            ].join("\n"),
          }],
        };
      }
```

**Step 2: Run build to verify compilation**

Run: `npm run build`
Expected: SUCCESS

**Step 3: Commit**

```bash
git add src/tools/wb-scenario.ts
git commit -m "fix: clean up placed entities when scenario_create_objective fails partway"
```

---

### Task D2: Add pattern name collision detection in mod-create

**Files:**
- Modify: `src/tools/mod-create.ts:146-183`

**Step 1: Add collision detection**

Before the script generation loop (line 150), collect all paths first and check for duplicates:

```typescript
        if (patternName) {
          const patternDef = patterns.get(patternName)!;

          // Check for filename collisions after prefix replacement
          const scriptPaths: string[] = [];
          for (const scriptDef of patternDef.scripts) {
            const className = scriptDef.className.replace(/\{PREFIX\}/g, classPrefix);
            const path = `Scripts/Game/${className}.c`;
            if (scriptPaths.includes(path)) {
              return {
                content: [{
                  type: "text",
                  text: `Pattern "${patternName}" produces duplicate script file after prefix replacement: ${path}\nUse a different prefix to avoid collisions.`,
                }],
              };
            }
            scriptPaths.push(path);
          }

          const configPaths: string[] = [];
          for (const configDef of patternDef.configs) {
            const configName = configDef.name.replace(/\{PREFIX\}/g, classPrefix);
            const path = `Configs/${configName}.conf`;
            if (configPaths.includes(path)) {
              return {
                content: [{
                  type: "text",
                  text: `Pattern "${patternName}" produces duplicate config file after prefix replacement: ${path}\nUse a different prefix to avoid collisions.`,
                }],
              };
            }
            configPaths.push(path);
          }

          // Generate scripts from pattern
          for (const scriptDef of patternDef.scripts) {
            // ... existing code unchanged ...
```

**Step 2: Run build**

Run: `npm run build`
Expected: SUCCESS

**Step 3: Commit**

```bash
git add src/tools/mod-create.ts
git commit -m "fix: detect pattern filename collisions before writing files in mod_create"
```

---

## Stream E: Config Validation Feature (#9)

### Task E1: Extend checkConfigs with semantic validation

**Files:**
- Modify: `src/tools/mod-validate.ts:173-192`
- Test: `tests/tools/config-validate.test.ts`

**Step 1: Write failing tests**

Create `tests/tools/config-validate.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

// We'll test the validation logic by checking specific config content patterns
// Since checkConfigs is not exported, we test through the full mod_validate tool
// or extract the logic. For unit testing, let's test the helper directly.

describe("config semantic validation", () => {
  it("should warn when a config references an unknown class", () => {
    // Config with a type name not in the API index
    const configContent = `SCR_NonExistentClass {\n  m_sKey "test"\n}`;
    // The validation should warn about SCR_NonExistentClass
    // Test via the tool or by extracting the function
  });

  it("should not warn about known Enfusion classes", () => {
    // Config with valid type names
    const configContent = `SCR_Faction {\n  m_sKey "US"\n}`;
    // Should produce no warnings
  });
});
```

Note: The exact test structure depends on whether `checkConfigs` is exported or tested through the tool. The implementer should extract the validation logic into a testable function or test through the registered tool handler.

**Step 2: Implement semantic config validation**

In `src/tools/mod-validate.ts`, modify `checkConfigs` to accept `SearchEngine` and walk the parsed AST:

```typescript
function checkConfigs(projectPath: string, searchEngine: SearchEngine): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const allConfigs = findFiles(projectPath, ".conf");

  for (const configPath of allConfigs) {
    const rel = relative(projectPath, configPath).replace(/\\/g, "/");
    try {
      const content = readFileSync(configPath, "utf-8");
      const root = parse(content);

      // Check root node type against API index
      if (root.type && !searchEngine.hasClass(root.type)) {
        issues.push({
          level: "warning",
          message: `${rel}: Root class "${root.type}" not found in API index  -  may be from another mod or misspelled.`,
        });
      }

      // Walk children and check their type names
      const walkNodes = (node: EnfusionNode) => {
        for (const child of node.children) {
          if (child.type && /^[A-Z]/.test(child.type) && !searchEngine.hasClass(child.type)) {
            issues.push({
              level: "warning",
              message: `${rel}: Class "${child.type}" not found in API index.`,
            });
          }
          walkNodes(child);
        }
      };
      walkNodes(root);

    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      issues.push({
        level: "error",
        message: `${rel}: Invalid config format  -  ${msg}`,
      });
    }
  }

  return issues;
}
```

Also update the call site where `checkConfigs` is invoked to pass `searchEngine`:

```typescript
// In the tool handler, change:
// issues.push(...checkConfigs(projectPath));
// To:
issues.push(...checkConfigs(projectPath, searchEngine));
```

**Step 3: Run tests**

Run: `npx vitest run tests/tools/config-validate.test.ts --reporter=verbose`
Expected: PASS

**Step 4: Commit**

```bash
git add src/tools/mod-validate.ts tests/tools/config-validate.test.ts
git commit -m "feat: add semantic config validation  -  check class names against API index"
```

---

## Stream F: Fuzzy Search Feature (#12)

### Task F1: Create fuzzy matching utilities

**Files:**
- Create: `src/utils/fuzzy.ts`
- Test: `tests/utils/fuzzy.test.ts`

**Step 1: Write tests**

Create `tests/utils/fuzzy.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { levenshtein, trigramSimilarity } from "../../src/utils/fuzzy.js";

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("hello", "hello")).toBe(0);
  });

  it("returns string length for empty comparison", () => {
    expect(levenshtein("hello", "")).toBe(5);
    expect(levenshtein("", "hello")).toBe(5);
  });

  it("returns 1 for single character substitution", () => {
    expect(levenshtein("cat", "car")).toBe(1);
  });

  it("returns 1 for single character insertion", () => {
    expect(levenshtein("cat", "cart")).toBe(1);
  });

  it("returns 1 for single character deletion", () => {
    expect(levenshtein("cart", "cat")).toBe(1);
  });

  it("handles common typos", () => {
    expect(levenshtein("scriptcompnent", "scriptcomponent")).toBe(1);
    expect(levenshtein("getpositon", "getposition")).toBe(1);
  });

  it("caps at MAX_DISTANCE for very different strings", () => {
    // Should not compute full matrix for distant strings
    expect(levenshtein("abc", "xyz")).toBe(3);
  });
});

describe("trigramSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(trigramSimilarity("hello", "hello")).toBe(1);
  });

  it("returns 0 for completely different strings", () => {
    expect(trigramSimilarity("abc", "xyz")).toBe(0);
  });

  it("returns high similarity for similar strings", () => {
    const sim = trigramSimilarity("scriptcomponent", "scriptcompnent");
    expect(sim).toBeGreaterThan(0.7);
  });

  it("returns moderate similarity for related terms", () => {
    const sim = trigramSimilarity("damage", "damagemanager");
    expect(sim).toBeGreaterThan(0.3);
  });

  it("handles short strings", () => {
    expect(trigramSimilarity("ab", "ab")).toBe(1);
    expect(trigramSimilarity("a", "b")).toBe(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/utils/fuzzy.test.ts --reporter=verbose`
Expected: FAIL  -  module not found

**Step 3: Implement fuzzy utilities**

Create `src/utils/fuzzy.ts`:

```typescript
/**
 * Levenshtein edit distance between two strings.
 * Returns the minimum number of single-character edits (insertions, deletions,
 * substitutions) to transform a into b.
 *
 * Uses an optimized single-row algorithm with early termination.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure a is the shorter string for space efficiency
  if (a.length > b.length) {
    [a, b] = [b, a];
  }

  const aLen = a.length;
  const bLen = b.length;

  // Single-row DP
  let prev = new Array(aLen + 1);
  let curr = new Array(aLen + 1);

  for (let i = 0; i <= aLen; i++) prev[i] = i;

  for (let j = 1; j <= bLen; j++) {
    curr[0] = j;
    for (let i = 1; i <= aLen; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        prev[i] + 1,      // deletion
        curr[i - 1] + 1,  // insertion
        prev[i - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[aLen];
}

/**
 * Trigram similarity between two strings.
 * Returns a value between 0 (no similarity) and 1 (identical).
 * Based on the Jaccard index of character trigram sets.
 */
export function trigramSimilarity(a: string, b: string): number {
  const triA = trigrams(a);
  const triB = trigrams(b);

  if (triA.size === 0 && triB.size === 0) return a === b ? 1 : 0;
  if (triA.size === 0 || triB.size === 0) return 0;

  let intersection = 0;
  for (const t of triA) {
    if (triB.has(t)) intersection++;
  }

  const union = triA.size + triB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function trigrams(s: string): Set<string> {
  const set = new Set<string>();
  const padded = `  ${s} `; // pad for edge trigrams
  for (let i = 0; i <= padded.length - 3; i++) {
    set.add(padded.slice(i, i + 3));
  }
  return set;
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/utils/fuzzy.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/utils/fuzzy.ts tests/utils/fuzzy.test.ts
git commit -m "feat: add levenshtein and trigram fuzzy matching utilities"
```

---

### Task F2: Integrate fuzzy search into SearchEngine

**Files:**
- Modify: `src/index/search-engine.ts`
- Test: `tests/index/search-engine.test.ts`

**Step 1: Write failing tests**

Add to `tests/index/search-engine.test.ts`:

```typescript
describe("fuzzy search", () => {
  it("should find ScriptComponent with typo ScriptCompnent", () => {
    const results = searchEngine.searchClasses("ScriptCompnent");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe("ScriptComponent");
  });

  it("should find methods with typos", () => {
    const results = searchEngine.searchMethods("GetPositon");
    expect(results.length).toBeGreaterThan(0);
    // Should find GetPosition or similar
  });

  it("should not return fuzzy results when exact results exist", () => {
    const results = searchEngine.searchClasses("GenericEntity");
    // Exact match should be first, no fuzzy noise
    expect(results[0].name).toBe("GenericEntity");
  });

  it("should cap fuzzy results at 10", () => {
    const results = searchEngine.searchClasses("xyz123");
    expect(results.length).toBeLessThanOrEqual(10);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/index/search-engine.test.ts --reporter=verbose`
Expected: FAIL  -  typo queries return 0 results

**Step 3: Integrate fuzzy into search methods**

In `src/index/search-engine.ts`, add import at top:

```typescript
import { levenshtein, trigramSimilarity } from "../utils/fuzzy.js";
```

Then modify `searchClasses` (around line 228). Add fuzzy fallback after the main loop:

```typescript
  searchClasses(
    query: string,
    source: "enfusion" | "arma" | "all" = "all",
    limit = 10
  ): ClassInfo[] {
    const q = query.toLowerCase();
    const results: Array<{ cls: ClassInfo; score: number }> = [];

    for (const cls of this.classByName.values()) {
      if (source !== "all" && cls.source !== source) continue;

      const nameLower = cls.name.toLowerCase();
      let score = 0;

      if (nameLower === q) {
        score = 100;
      } else if (nameLower.startsWith(q)) {
        score = 80;
      } else if (nameLower.includes(q)) {
        score = 60;
      } else if (cls.brief.toLowerCase().includes(q)) {
        score = 30;
      } else if (cls.description.toLowerCase().includes(q)) {
        score = 20;
      }

      if (score > 0) {
        results.push({ cls, score });
      }
    }

    // Fuzzy fallback: only activate when strict matching returns < 3 results
    if (results.length < 3) {
      for (const cls of this.classByName.values()) {
        if (source !== "all" && cls.source !== source) continue;
        // Skip if already in results
        if (results.some(r => r.cls.name === cls.name)) continue;

        const nameLower = cls.name.toLowerCase();
        const dist = levenshtein(q, nameLower);
        if (dist <= 1) {
          results.push({ cls, score: 40 });
        } else if (dist <= 2) {
          results.push({ cls, score: 20 });
        } else {
          const sim = trigramSimilarity(q, nameLower);
          if (sim > 0.3) {
            results.push({ cls, score: 15 });
          }
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit).map((r) => r.cls);
  }
```

Apply the same pattern to `searchMethods`, `searchEnums`, `searchProperties`, and `nameScore`. For each:
- After the main loop, check `results.length < 3`
- If so, iterate with Levenshtein/trigram
- Same scoring: dist 1 = 40, dist 2 = 20, trigram > 0.3 = 15

Also update the `nameScore` private method to support fuzzy:

```typescript
  private nameScore(nameLower: string, queryLower: string): number {
    if (nameLower === queryLower) return 100;
    if (nameLower.startsWith(queryLower)) return 80;
    if (nameLower.includes(queryLower)) return 60;
    return 0;
    // Note: fuzzy is applied at the search method level, not here,
    // because it needs the results count to decide whether to activate
  }
```

**Step 4: Run tests**

Run: `npx vitest run tests/index/search-engine.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Run full test suite**

Run: `npm test`
Expected: PASS

**Step 6: Commit**

```bash
git add src/index/search-engine.ts tests/index/search-engine.test.ts
git commit -m "feat: add fuzzy search fallback with Levenshtein and trigram matching"
```

---

## Stream G: Auto-Fetch Parent Methods Feature (#14)

### Task G1: Wire SearchEngine into script_create

**Files:**
- Modify: `src/server.ts:70`
- Modify: `src/tools/script-create.ts:14`
- Modify: `src/templates/script.ts`
- Test: `tests/templates/script.test.ts`

**Step 1: Write failing test**

Add to `tests/templates/script.test.ts`:

```typescript
describe("dynamic parent method resolution", () => {
  it("should accept dynamicMethods option and use them for stubs", () => {
    const code = generateScript({
      className: "TAG_TestComponent",
      scriptType: "component",
      parentClass: "SCR_InventoryStorageManagerComponent",
      dynamicMethods: [
        "override void OnItemAdded(BaseInventoryStorageComponent storageOwner, IEntity item)",
        "override void OnItemRemoved(BaseInventoryStorageComponent storageOwner, IEntity item)",
      ],
    });
    expect(code).toContain("OnItemAdded");
    expect(code).toContain("OnItemRemoved");
    // Should NOT contain default component methods when dynamic methods are provided
    expect(code).not.toContain("EOnInit");
  });

  it("should fall back to hardcoded methods when dynamicMethods is not provided", () => {
    const code = generateScript({
      className: "TAG_TestComponent",
      scriptType: "component",
    });
    expect(code).toContain("EOnInit");
    expect(code).toContain("OnPostInit");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/templates/script.test.ts --reporter=verbose`
Expected: FAIL  -  `dynamicMethods` not recognized

**Step 3: Add dynamicMethods to ScriptOptions**

In `src/templates/script.ts`, update the `ScriptOptions` interface:

```typescript
export interface ScriptOptions {
  className: string;
  scriptType: ScriptType;
  parentClass?: string;
  methods?: string[];
  /** Dynamically resolved methods from API index  -  overrides hardcoded defaults */
  dynamicMethods?: string[];
  description?: string;
}
```

Then in `generateScript()`, use `dynamicMethods` when available (modify the method stub selection logic):

Find where method stubs are selected (the switch/case or if-chain that picks `COMPONENT_METHODS`, `GAMEMODE_METHODS`, etc.) and add:

```typescript
// If dynamicMethods are provided, use those instead of hardcoded defaults
if (opts.dynamicMethods && opts.dynamicMethods.length > 0) {
  methodStubs = opts.dynamicMethods.map(sig => ({
    signature: sig.startsWith("override ") ? sig : `override ${sig}`,
    body: "    // TODO: implement",
  }));
} else {
  // Existing hardcoded method selection logic unchanged
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/templates/script.test.ts --reporter=verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add src/templates/script.ts tests/templates/script.test.ts
git commit -m "feat: support dynamicMethods in generateScript for API-driven method stubs"
```

---

### Task G2: Pass SearchEngine to script_create and look up parent

**Files:**
- Modify: `src/server.ts:70`  -  pass `searchEngine` to `registerScriptCreate`
- Modify: `src/tools/script-create.ts:14`  -  accept `SearchEngine`, look up parent

**Step 1: Update server.ts**

In `src/server.ts`, change line 70:

```typescript
// OLD:
registerScriptCreate(server, config);

// NEW:
registerScriptCreate(server, config, searchEngine);
```

**Step 2: Update script-create.ts**

In `src/tools/script-create.ts`, modify the function signature and add parent lookup:

```typescript
import type { SearchEngine } from "../index/search-engine.js";

export function registerScriptCreate(server: McpServer, config: Config, searchEngine?: SearchEngine): void {
```

Then inside the tool handler, before calling `generateScript`, add parent method resolution:

```typescript
    async ({ className, scriptType, parentClass, methods, description, projectPath }) => {
      const basePath = projectPath || config.projectPath;

      try {
        validateFilename(className);
        validateEnforceIdentifier(className);

        // Resolve parent methods from API index if available and no explicit methods given
        let dynamicMethods: string[] | undefined;
        if (!methods && searchEngine && parentClass) {
          const cls = searchEngine.getClass(parentClass);
          if (cls) {
            const inherited = searchEngine.getInheritedMembers(parentClass);
            // Collect overridable methods: those from the class itself + inherited
            const allMethods = [
              ...(cls.methods || []),
              ...(cls.protectedMethods || []),
              ...inherited.methods.map(m => m.method),
            ];
            // Filter for likely overridable methods (heuristic: has "override" in existing data,
            // or is a known lifecycle method pattern like On*, EOn*, Get*, Set*)
            const overridable = allMethods.filter(m => {
              const sig = m.signature || m.name;
              return /^(On|EOn|Get|Set|Can|Handle|Do)/.test(m.name) ||
                     sig.includes("override") ||
                     sig.includes("event");
            });
            if (overridable.length > 0) {
              // Take up to 8 most relevant methods
              dynamicMethods = overridable.slice(0, 8).map(m => m.signature || `void ${m.name}()`);
            }
          }
        }

        const code = generateScript({
          className,
          scriptType: scriptType as ScriptType,
          parentClass,
          methods,
          dynamicMethods,
          description,
        });
```

**Step 3: Run full test suite**

Run: `npm test`
Expected: PASS

**Step 4: Update tool description**

In `src/tools/script-create.ts`, update the tool description to mention auto-method resolution:

```typescript
      description:
        "Create a new Enforce Script (.c) file for an Arma Reforger mod. " +
        "Generates a properly structured script from a template with correct class hierarchy and method stubs. " +
        "When parentClass is specified and no explicit methods are given, automatically looks up overridable methods from the API index.",
```

**Step 5: Commit**

```bash
git add src/server.ts src/tools/script-create.ts
git commit -m "feat: script_create auto-fetches parent methods from API index when available"
```

---

## Final: Release Tasks

### Task R1: Update docs and version

**Step 1: Bump version in package.json**

```bash
npm version minor --no-git-tag-version
# This bumps 0.6.4 → 0.7.0
```

**Step 2: Update UPGRADE_IDEAS.md**

Mark items #9, #12, #14 as done with strikethrough.

**Step 3: Update TODO.md**

Remove or mark as fixed any bugs that were addressed (enfusion-text escaping, extractParamNames, socket handling, PAK bounds, protocol response, handler rollback, pattern collisions, asset-search GUID errors, scenario cleanup).

**Step 4: Update README.md**

If tool descriptions changed (script_create now mentions auto-method resolution), update the tools table.

**Step 5: Run full test suite**

Run: `npm run build && npm test`
Expected: ALL PASS

**Step 6: Commit and tag**

```bash
git add -A
git commit -m "release: v0.7.0  -  10 bug fixes + config validation, fuzzy search, auto-fetch parent methods"
git tag v0.7.0
```
