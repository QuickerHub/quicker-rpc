import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";
import { resolveServeQkrpcRuntime } from "./qkrpc-bin.mjs";

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("resolveServeQkrpcRuntime", () => {
  test("finds a serve runtime in dev checkout or user install", () => {
    const runtime = resolveServeQkrpcRuntime(agentGuiRoot);
    assert.ok(runtime, "expected qkrpc runtime for dev serve auto-recovery");
    assert.ok(existsSync(runtime.exe), `missing exe: ${runtime.exe}`);
    assert.equal(typeof runtime.dir, "string");
    assert.ok(runtime.dir.length > 0);
    assert.ok(
      ["staged", "QKRPC_BIN", "bundled", "installed"].includes(runtime.source),
      `unexpected source: ${runtime.source}`,
    );
  });
});
