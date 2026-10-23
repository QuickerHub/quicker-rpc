import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const agentGuiRoot = resolve(repoRoot, "agent-gui");
const packageJson = JSON.parse(readFileSync(resolve(agentGuiRoot, "package.json"), "utf8"));
const suiteNames = [
  "test:tools",
  "test:agent-eval",
  "test:authoring-benchmark",
  "test:action-trace-location",
];
const failures = [];

function readSuite(name) {
  const command = packageJson.scripts?.[name];
  if (typeof command !== "string") {
    throw new Error(`Missing Agent regression suite: ${name}`);
  }

  const [runner, mode, ...files] = command.trim().split(/\s+/);
  // Keep shell syntax, options, globs and traversal out of the audited test list.
  const explicitTestPath = /^(?:[A-Za-z0-9_][A-Za-z0-9_.-]*\/)*[A-Za-z0-9_][A-Za-z0-9_.-]*\.test\.ts$/;
  if (runner !== "tsx" || mode !== "--test" || files.length === 0
    || files.some((file) => !explicitTestPath.test(file))) {
    throw new Error(`Unexpected command for ${name}; expected tsx --test followed only by explicit relative *.test.ts paths`);
  }

  return { name, files };
}

function run(label, args) {
  console.log(`ci-agent-regressions: running ${label}`);
  const result = spawnSync(process.execPath, args, {
    cwd: agentGuiRoot,
    stdio: "inherit",
  });
  if (result.error) {
    const reason = `could not start: ${result.error.message}`;
    failures.push({ label, reason });
    console.error(`ci-agent-regressions: ${label} ${reason}`);
  } else if (result.status !== 0) {
    const reason = `failed (${result.signal ?? result.status ?? "unknown"})`;
    failures.push({ label, reason });
    console.error(`ci-agent-regressions: ${label} ${reason}`);
  } else {
    console.log(`ci-agent-regressions: passed ${label}`);
  }
}

// Validate every suite before starting any child process.
const suites = suiteNames.map(readSuite);
for (const { name, files } of suites) {
  run(name, [
    "node_modules/tsx/dist/cli.mjs",
    "--conditions=react-server",
    "--test",
    "--test-timeout=15000",
    "--test-concurrency=4",
    "--import",
    "./scripts/agent-offline-network-guard.mjs",
    ...files,
  ]);
}

run("electron:check (static)", ["scripts/electron-check.mjs"]);
if (failures.length > 0) {
  console.error(`ci-agent-regressions: ${failures.length} check(s) failed:`);
  for (const { label, reason } of failures) {
    console.error(`- ${label}: ${reason}`);
  }
  process.exitCode = 1;
} else {
  console.log("ci-agent-regressions: all checks passed");
}
