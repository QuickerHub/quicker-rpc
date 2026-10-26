import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Real React editors in an isolated Edge page; every browser request is denied.
// Requires an installed Microsoft Edge. No model, Quicker instance or user data.
// The full APDE file now exceeds one minute. Keep individual test deadlines in
// the specs, while allowing its sequential file worker to finish the suite.
const result = spawnSync(process.execPath, [
  "node_modules/tsx/dist/cli.mjs", "--test", "--test-concurrency=1",
  "--test-timeout=300000", "--import", "./scripts/agent-offline-network-guard.mjs",
  "lib/action-editor/program/XProgramEditor.browser.test.ts",
  "components/action-editor/ActionProjectDataEditor.browser.test.ts",
  "components/workspace/WorkspaceDocumentHost.browser.test.ts",
  "components/workspace/WorkspaceNestedStepPin.browser.test.ts",
  "components/chat/ModelSelector.browser.test.ts",
  "components/chat/DocsViewer.browser.test.ts",
], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
