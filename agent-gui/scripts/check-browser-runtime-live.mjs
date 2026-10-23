import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Explicit local acceptance only; never added to the synthetic offline CI manifest.
const result = spawnSync(process.execPath, ["--test", "--test-concurrency=1", "--test-timeout=45000", "browser-runtime/runtime-cancellation.integration.test.mjs"], {
  cwd: root, stdio: "inherit", env: { ...process.env, QKRPC_BROWSER_LIVE_ACCEPTANCE: "1" },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
