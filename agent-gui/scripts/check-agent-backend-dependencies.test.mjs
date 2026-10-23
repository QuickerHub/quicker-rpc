import assert from "node:assert/strict";
import test from "node:test";
import { inspectAgentBackendDependencies } from "./check-agent-backend-dependencies.mjs";

test("production Agent and runtime adapters compile in memory without Next or server-only runtime imports", async () => {
  const report = await inspectAgentBackendDependencies();
  assert.equal(report.ok, true);
  assert.deepEqual(report.nextImports, []);
  assert.ok(report.inputCount > 300);
  assert.ok(report.serverOnlyMarkerImporters > 0);
  assert.ok(report.nativeExternalPackages.includes("better-sqlite3"));
  assert.ok(!report.externalPackages.includes("server-only"));
});

test("the static graph rejects a Next dependency without importing it", async () => {
  await assert.rejects(inspectAgentBackendDependencies({ entryPoints: [], stdin: {
    contents: 'export { NextResponse } from "next/server";',
    sourcefile: "synthetic-next-adapter.ts",
    loader: "ts",
  } }), /Agent backend imports Next/);
});

test("server-only is compiled away for headless Node while other packages remain external", async () => {
  const report = await inspectAgentBackendDependencies({ entryPoints: [], stdin: {
    contents: 'import "server-only"; export { streamText } from "ai";',
    sourcefile: "synthetic-headless-entry.ts",
    loader: "ts",
  } });
  assert.equal(report.serverOnlyMarkerImporters, 1);
  assert.deepEqual(report.externalPackages, ["ai"]);
});
