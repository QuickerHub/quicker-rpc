import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Explicit opt-in: fixtures create their own loopback listeners. Providers/tools
// are synthetic, and the actual CLI child has an isolated profile + network guard.
const tests = [
  "lib/gateway-guide-redirect.integration.test.ts",
  "lib/qkrpc-schema-read.loopback.test.ts",
  "lib/agent-service/node-http.loopback.test.ts",
  "service/shell-watch.integration.test.ts",
  "lib/designer-resource-action-open.lifecycle.integration.test.ts",
  "lib/agent-service/service.integration.test.ts",
  "service/cli.integration.test.ts",
  "service/action-explorer-watch.integration.test.ts",
  "lib/db/writer-lease.process.test.ts",
  "lib/db/client.process.test.ts",
  "service/runtime-start-abort.integration.test.ts",
  "service/runtime-health-body.integration.test.ts",
  "service/terminal-cold-start.integration.test.ts",
];
for (const path of tests) {
  if (!statSync(resolve(root, path)).isFile()) throw new Error(`Missing service test: ${path}`);
}
const result = spawnSync(process.execPath, [
  "node_modules/tsx/dist/cli.mjs", "--conditions=react-server", "--test",
  `--test-concurrency=${process.platform === "win32" ? 2 : 4}`, "--test-timeout=15000", ...tests,
], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
