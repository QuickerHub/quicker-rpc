import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  isQuickerRpcMonorepoRoot,
  resolveQuickerRpcVersionJsonPath,
} from "./repo-paths.mjs";

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(agentGuiRoot, "..");

test("resolveQuickerRpcVersionJsonPath finds QuickerRpc/version.json", () => {
  const path = resolveQuickerRpcVersionJsonPath(repoRoot);
  assert.ok(path);
  assert.match(path, /QuickerRpc[\\/]version\.json$/);
});

test("isQuickerRpcMonorepoRoot true in quicker-rpc checkout", () => {
  assert.equal(isQuickerRpcMonorepoRoot(repoRoot), true);
});

test("isQuickerRpcMonorepoRoot false for agent-gui alone", () => {
  assert.equal(isQuickerRpcMonorepoRoot(agentGuiRoot), false);
});
