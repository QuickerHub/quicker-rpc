/**
 * Verify staged/bundled QuickerAgent resources include agent-gui (Next standalone) + qkrpc.
 * Run after tauri-prepare.mjs and/or tauri build (release/resources).
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const agentGuiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const tauriRoot = join(agentGuiRoot, "src-tauri");

const checkBundled = process.env.VERIFY_BUNDLED === "1";

/** @type {{ label: string, dir: string }[]} */
const roots = [{ label: "staged", dir: join(tauriRoot, "resources") }];
if (checkBundled) {
  roots.push({
    label: "bundled",
    dir: join(tauriRoot, "target", "release", "resources"),
  });
}

const required = [
  { rel: "app/server.js", minBytes: 100 },
  { rel: "app/.next/BUILD_ID", minBytes: 1 },
  { rel: "node/node.exe", minBytes: 40 * 1024 * 1024 },
  { rel: "qkrpc/qkrpc.exe", minBytes: 100 * 1024 },
];

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
      console.log(`verify-tauri-bundle: skip ${label} (${dir} not found yet)`);
      return true;
    }
    throw new Error(`Missing ${label} resources dir: ${dir}`);
  }

  const structuredApp = join(dir, "app", "server.js");
  const flatServer = join(dir, "server.js");
  if (!existsSync(structuredApp) && existsSync(flatServer)) {
    throw new Error(
      `${label}: resources look flattened (found ${flatServer} but not app/server.js). ` +
        `Use bundle.resources = ["resources/"] in tauri.conf.json.`,
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

  const qkrpcFiles = countFiles(join(dir, "qkrpc"));
  if (qkrpcFiles < 50) {
    throw new Error(
      `${label}: qkrpc/ has only ${qkrpcFiles} files (expected full publish/cli layout)`,
    );
  }

  console.log(
    `verify-tauri-bundle: OK ${label} — app + node + qkrpc (${qkrpcFiles} files under qkrpc/)`,
  );
  return true;
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
