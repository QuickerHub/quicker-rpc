#!/usr/bin/env node
/**
 * Spawns `qkrpc mcp` for MCP hosts that expect a Node bin (npx / npm).
 * Requires qkrpc CLI installed on Windows (setup.exe or publish/cli).
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

function resolveQkrpcExe() {
  if (process.env.QKRPC_EXE) {
    const explicit = process.env.QKRPC_EXE.trim();
    if (fs.existsSync(explicit)) {
      return explicit;
    }
  }

  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const installed = path.join(localAppData, "Programs", "qkrpc", "qkrpc.exe");
      if (fs.existsSync(installed)) {
        return installed;
      }
    }
  }

  return "qkrpc";
}

const exe = resolveQkrpcExe();
const useShell = exe === "qkrpc";
const child = spawn(exe, ["mcp", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
  shell: useShell,
});

child.on("error", (err) => {
  console.error(
    "qkrpc-mcp: failed to start qkrpc. Install CLI from https://github.com/QuickerHub/quicker-rpc/releases or set QKRPC_EXE.",
  );
  console.error(err.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
