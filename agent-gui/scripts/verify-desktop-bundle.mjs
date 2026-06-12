/**
 * Verify staged/bundled QuickerAgent resources include agent-gui (Next standalone) + qkrpc.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  /** @type {Record<string, string>} */
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--resources-dir" && argv[i + 1]) {
      out.resourcesDir = argv[++i];
    } else if (arg === "--label" && argv[i + 1]) {
      out.label = argv[++i];
    } else if (arg === "--check-bundled") {
      out.checkBundled = "1";
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const checkBundled =
  args.checkBundled === "1" || process.env.VERIFY_BUNDLED === "1";

const required = [
  { rel: "app/server.js", minBytes: 100 },
  { rel: "app/drizzle/migrations/meta/_journal.json", minBytes: 10 },
  { rel: "app/drizzle/migrations/0000_initial.sql", minBytes: 10 },
  { rel: "app/.next/BUILD_ID", minBytes: 1 },
  { rel: "app/llm-config.json", minBytes: 10 },
  {
    rel: "app/node_modules/next/dist/compiled/next-server/app-route.runtime.prod.js",
    minBytes: 10_000,
  },
  {
    rel: "app/node_modules/next/dist/server/app-render/dynamic-access-async-storage.external.js",
    minBytes: 100,
  },
  { rel: "node/node.exe", minBytes: 40 * 1024 * 1024 },
  { rel: "qkrpc/qkrpc.exe", minBytes: 100 * 1024 },
  { rel: "rg/rg.exe", minBytes: 100 * 1024 },
  { rel: "app/browser-runtime/protocol.mjs", minBytes: 100 },
  { rel: "app/terminal-runtime/server.mjs", minBytes: 100 },
  { rel: "app/lib/qkrpc-toolchain-env.mjs", minBytes: 100 },
  { rel: "app/node_modules/node-pty/package.json", minBytes: 10 },
  { rel: "app/node_modules/ws/package.json", minBytes: 10 },
  { rel: "app/node_modules/better-sqlite3/lib/index.js", minBytes: 100 },
  {
    rel: "app/node_modules/better-sqlite3/build/Release/better_sqlite3.node",
    minBytes: 500 * 1024,
  },
  { rel: "app/node_modules/bindings/bindings.js", minBytes: 100 },
  { rel: "app/node_modules/file-uri-to-path/index.js", minBytes: 100 },
];

const bundledKeyEnv =
  process.env.BUNDLED_LLM_BINGLEIMUZI_API_KEY?.trim()
  || process.env.BUNDLED_LLM_AI98PRO_API_KEY?.trim()
  || process.env.LLM_BINGLEIMUZI_API_KEY?.trim()
  || process.env.LLM_AI98PRO_API_KEY?.trim();

function countFiles(dir) {
  let n = 0;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) n += countFiles(p);
    else n += 1;
  }
  return n;
}

function verifyRoot({ label, dir }) {
  if (!existsSync(dir)) {
    if (label === "bundled") {
      console.log(`verify-desktop-bundle: skip ${label} (${dir} not found yet)`);
      return true;
    }
    throw new Error(`Missing ${label} resources dir: ${dir}`);
  }

  const structuredApp = join(dir, "app", "server.js");
  const flatServer = join(dir, "server.js");
  if (!existsSync(structuredApp) && existsSync(flatServer)) {
    throw new Error(
      `${label}: resources look flattened (found ${flatServer} but not app/server.js). ` +
        `Stage under resources/app/ with desktop-bundle-prepare.`,
    );
  }

  for (const { rel, minBytes } of required) {
    const path = join(dir, rel);
    if (!existsSync(path)) {
      throw new Error(`${label}: missing ${rel} (expected ${path})`);
    }
    const size = statSync(path).size;
    if (size < minBytes) {
      throw new Error(`${label}: ${rel} too small (${size} < ${minBytes} bytes)`);
    }
  }

  // Load the native SQLite addon with the bundled Node to catch ABI mismatches.
  const bundledNode = join(dir, "node", "node.exe");
  if (process.platform === "win32" && existsSync(bundledNode)) {
    const probe = spawnSync(
      bundledNode,
      [
        "-e",
        "const D=require('better-sqlite3');new D(':memory:').exec('select 1');console.log('better-sqlite3 ok')",
      ],
      { cwd: join(dir, "app"), encoding: "utf8" },
    );
    if (probe.status !== 0) {
      throw new Error(
        `${label}: bundled node failed to load better-sqlite3 — agent.db persistence broken\n${probe.stderr}`,
      );
    }
  }

  const qkrpcFiles = countFiles(join(dir, "qkrpc"));
  if (qkrpcFiles < 50) {
    throw new Error(
      `${label}: qkrpc/ has only ${qkrpcFiles} files (expected full publish/cli layout)`,
    );
  }

  if (bundledKeyEnv) {
    const secretsPath = join(dir, "app", "llm-bundled-secrets.json");
    if (!existsSync(secretsPath)) {
      throw new Error(
        `${label}: BUNDLED_LLM_* env set but missing app/llm-bundled-secrets.json`,
      );
    }
  }

  console.log(
    `verify-desktop-bundle: OK ${label} — app + node + qkrpc + rg (${qkrpcFiles} files under qkrpc/)`,
  );
  return true;
}

/** @type {{ label: string, dir: string }[]} */
const roots = [];

if (args.resourcesDir) {
  roots.push({
    label: args.label ?? "staged",
    dir: args.resourcesDir,
  });
} else {
  roots.push({
    label: "tauri-staged",
    dir: join(agentGuiRoot, "src-tauri", "resources"),
  });
}

if (checkBundled) {
  const bundledDir = args.resourcesDir
    ? join(dirname(args.resourcesDir), "target", "release", "resources")
    : join(agentGuiRoot, "src-tauri", "target", "release", "resources");
  roots.push({ label: "bundled", dir: bundledDir });
}

let ok = true;
for (const root of roots) {
  try {
    verifyRoot(root);
  } catch (e) {
    console.error(String(e));
    ok = false;
  }
}

if (!ok) process.exit(1);
