import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  resolvePathWithinRevealScope,
  resolveRevealScopeRoot,
  windowsExplorerSelectArg,
} from "@/lib/reveal-path-in-file-manager.server";

test("resolveRevealScopeRoot chat-exports uses app data exports dir", () => {
  const previous = process.env.APPDATA;
  const root = mkdtempSync(join(tmpdir(), "reveal-scope-"));
  process.env.APPDATA = root;
  try {
    const scopeRoot = resolveRevealScopeRoot("chat-exports");
    assert.ok(scopeRoot.endsWith("exports"));
    assert.ok(scopeRoot.includes("QuickerAgent"));
  } finally {
    if (previous === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previous;
  }
});

test("resolvePathWithinRevealScope rejects paths outside scope", () => {
  const previous = process.env.APPDATA;
  const root = mkdtempSync(join(tmpdir(), "reveal-guard-"));
  process.env.APPDATA = root;
  try {
    const scopeRoot = resolveRevealScopeRoot("chat-exports");
    mkdirSync(scopeRoot, { recursive: true });
    writeFileSync(join(scopeRoot, "inside.json"), "{}");
    const inside = join(scopeRoot, "inside.json");
    assert.equal(
      resolvePathWithinRevealScope("chat-exports", inside, { mustExist: true }),
      inside,
    );
    assert.throws(
      () =>
        resolvePathWithinRevealScope("chat-exports", "C:\\Windows\\System32\\cmd.exe"),
      /outside the allowed directory/,
    );
  } finally {
    if (previous === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previous;
  }
});

test("windowsExplorerSelectArg quotes paths with spaces", () => {
  assert.equal(
    windowsExplorerSelectArg(String.raw`C:\exports\hello world.json`),
    String.raw`/select,"C:\exports\hello world.json"`,
  );
  assert.equal(
    windowsExplorerSelectArg(String.raw`C:\exports\plain.json`),
    String.raw`/select,C:\exports\plain.json`,
  );
});
