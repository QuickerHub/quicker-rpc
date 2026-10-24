import assert from "node:assert/strict";
import childProcess from "node:child_process";
import http from "node:http";
import net from "node:net";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import { writeRuntimeMode } from "./runtime-mode.mjs";

test("missing static artifacts fail before any port probe, listener or backend allocation", async (t) => {
  const temporary = resolve(import.meta.dirname, "../../.tmp/backend-entry-preflight");
  mkdirSync(temporary, { recursive: true });
  const appDir = mkdtempSync(join(temporary, "app-"));
  writeFileSync(join(appDir, "server.js"), "// old overlay entry must not be selected\n");
  let allocations = 0;
  const denied = () => { allocations++; throw new Error("Unexpected backend allocation before artifact validation"); };
  const patches = [t.mock.method(net, "createConnection", denied), t.mock.method(net, "createServer", denied),
    t.mock.method(http, "createServer", denied), t.mock.method(childProcess, "spawn", denied)];
  syncBuiltinESMExports();
  try {
    const { startProductionBackends, shutdownBackends } = await import("./backend-spawn.mjs?missing-static-preflight");
    for (const smoke of [undefined, { root: appDir, runId: "a".repeat(32) }]) {
      await assert.rejects(startProductionBackends({ appDir, nodeExe: "unused-node", qkrpcDir: "unused-qkrpc", smoke }), /runtime-manifest\.json/);
      await shutdownBackends();
    }
    writeRuntimeMode(appDir, "legacy-next");
    await assert.rejects(startProductionBackends({ appDir, runtimeMode: "static", nodeExe: "unused-node", qkrpcDir: "unused-qkrpc" }), /Requested static.*selects legacy-next/);
    await shutdownBackends();
    assert.equal(allocations, 0);
  } finally {
    for (const patch of patches) patch.mock.restore();
    syncBuiltinESMExports();
    assert.ok(appDir.startsWith(temporary + sep));
    rmSync(appDir, { recursive: true, force: true });
  }
});
