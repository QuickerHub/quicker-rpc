/**
 * Stop prior agent-gui dev processes and free the UI port before a new dev session.
 * Used by start.mjs and start-agent-gui.ps1.
 */
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isInstalledProductionQuickerAgentProcess,
  isProductionQuickerAgentUiProcess,
} from "../lib/quicker-agent-install-probe.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultAgentGuiRoot = join(scriptDir, "..");

function resolvePreferredPort() {
  const raw =
    process.env.PORT?.trim()
    || process.env.AGENT_GUI_PORT?.trim()
    || "3000";
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 3000;
}

function listProtectedPids() {
  const protectedIds = new Set([process.pid]);
  if (process.platform !== "win32") {
    return protectedIds;
  }
  let current = process.pid;
  for (let depth = 0; depth < 32; depth++) {
    try {
      const ps = `(Get-CimInstance Win32_Process -Filter "ProcessId=${current}").ParentProcessId`;
      const parent = Number(
        execSync(`pwsh -NoProfile -Command "${ps}"`, {
          encoding: "utf8",
          timeout: 5000,
        }).trim(),
      );
      if (
        !Number.isFinite(parent)
        || parent <= 0
        || parent === current
        || protectedIds.has(parent)
      ) {
        break;
      }
      protectedIds.add(parent);
      current = parent;
    } catch {
      break;
    }
  }
  return protectedIds;
}

function stopProcessTree(pid, protectedPids) {
  if (!Number.isFinite(pid) || pid <= 0 || protectedPids.has(pid)) {
    return false;
  }
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
  try {
    process.kill(pid, "SIGTERM");
    return true;
  } catch {
    return false;
  }
}

function readWindowsProcessInfo(pid) {
  if (process.platform !== "win32" || !Number.isFinite(pid) || pid <= 0) {
    return null;
  }
  try {
    const ps = [
      `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" -ErrorAction SilentlyContinue;`,
      "if ($null -eq $p) { exit 0 };",
      "Write-Output ($p.Name + '|' + ($p.CommandLine ?? '') + '|' + ($p.ExecutablePath ?? ''))",
    ].join(" ");
    const out = execSync(`pwsh -NoProfile -Command "${ps}"`, {
      encoding: "utf8",
      timeout: 10_000,
    }).trim();
    if (!out) {
      return null;
    }
    const parts = out.split("|");
    if (parts.length < 2) {
      return { name: out.toLowerCase(), commandLine: "", executablePath: "" };
    }
    return {
      name: (parts[0] ?? "").toLowerCase(),
      commandLine: (parts[1] ?? "").toLowerCase(),
      executablePath: (parts[2] ?? "").toLowerCase(),
    };
  } catch {
    return null;
  }
}

function shouldProtectProductionProcess(pid) {
  const info = readWindowsProcessInfo(pid);
  if (!info) {
    return false;
  }
  return isProductionQuickerAgentUiProcess(
    info.name,
    info.commandLine,
    info.executablePath,
  );
}

function listProductionOccupiedPorts(ports) {
  const occupied = new Set();
  for (const port of ports) {
    for (const pid of listListeningPids(port)) {
      if (shouldProtectProductionProcess(pid)) {
        occupied.add(port);
        break;
      }
    }
  }
  return occupied;
}

function listListeningPids(port) {
  if (process.platform === "win32") {
    try {
      const ps = [
        `@(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue`,
        "| ForEach-Object { $_.OwningProcess }) | Sort-Object -Unique",
      ].join(" ");
      const out = execSync(`pwsh -NoProfile -Command "${ps}"`, {
        encoding: "utf8",
        timeout: 15_000,
      });
      return out
        .trim()
        .split(/\s+/)
        .map((value) => Number(value))
        .filter((pid) => Number.isFinite(pid) && pid > 0 && pid !== process.pid);
    } catch {
      return [];
    }
  }
  try {
    const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, {
      encoding: "utf8",
      timeout: 10_000,
    });
    return out
      .trim()
      .split(/\s+/)
      .map((value) => Number(value))
      .filter((pid) => Number.isFinite(pid) && pid > 0 && pid !== process.pid);
  } catch {
    return [];
  }
}

function listAgentGuiDevPids(agentGuiRoot) {
  if (process.platform !== "win32") {
    return [];
  }
  const agentGuiNorm = resolve(agentGuiRoot).replace(/\\/g, "/").toLowerCase();
  try {
    const ps = [
      "Get-CimInstance Win32_Process |",
      "ForEach-Object { $_.ProcessId.ToString() + '|' + $_.Name + '|' + ($_.CommandLine ?? '') + '|' + ($_.ExecutablePath ?? '') }",
    ].join(" ");
    const out = execSync(`pwsh -NoProfile -Command "${ps}"`, {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const pids = [];
    for (const line of out.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const parts = line.split("|");
      if (parts.length < 4) continue;
      const pid = Number(parts[0]);
      const name = (parts[1] ?? "").toLowerCase();
      const cmdLower = (parts[2] ?? "").toLowerCase();
      const exeLower = (parts[3] ?? "").toLowerCase();
      if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid) continue;

      let isAgentGuiDev = false;
      // Do not kill pwsh running start-agent-gui.ps1 — that is often the active launcher
      // (stop is invoked from that script). Node/next on the UI port are stopped separately.
      if (name === "quicker-agent.exe") {
        // Installed NSIS QuickerAgent must survive dev restarts (start-agent-gui.ps1 / pnpm dev).
        isAgentGuiDev = !isInstalledProductionQuickerAgentProcess(
          name,
          cmdLower,
          exeLower,
        );
      } else if (name === "node.exe" && /start-server\.js/.test(cmdLower)) {
        // Orphaned Next dev listener after a crashed Tauri/browser session.
        isAgentGuiDev =
          cmdLower.includes(agentGuiNorm.replace(/\//g, "\\"))
          || cmdLower.includes(agentGuiNorm)
          || cmdLower.includes("quicker-rpc-agent-gui")
          || cmdLower.includes("\\agent-gui\\");
      } else if (
        ["node.exe", "pnpm.exe", "cmd.exe", "cargo.exe", "rustc.exe"].includes(name)
        && (cmdLower.includes(agentGuiNorm.replace(/\//g, "\\")) || cmdLower.includes(agentGuiNorm))
      ) {
        const nodeOrNext =
          /start\.mjs/.test(cmdLower)
          || /start-server\.js/.test(cmdLower)
          || /detached-flush\.js/.test(cmdLower)
          || /\bnext(\.cmd)?\b/.test(cmdLower)
          || /tauri-dev\.mjs/.test(cmdLower)
          || /tauri-before-dev\.mjs/.test(cmdLower)
          || /\btauri\b.*\bdev\b/.test(cmdLower);
        const pnpmDevScript =
          /\bdev(:browser|:webpack|:full)?\b/.test(cmdLower)
          && (/start\.mjs/.test(cmdLower) || /\bnext(\.cmd)?\b/.test(cmdLower));
        isAgentGuiDev =
          name === "node.exe"
            ? nodeOrNext || /\bdev(:browser|:webpack|:full)?\b/.test(cmdLower)
            : nodeOrNext || pnpmDevScript;
      }
      if (isAgentGuiDev) {
        pids.push(pid);
      }
    }
    return pids;
  } catch {
    return [];
  }
}

function stopPorts(ports, protectedPids, skipPorts = new Set()) {
  const stopped = new Set();
  for (const port of ports) {
    if (skipPorts.has(port)) {
      continue;
    }
    for (const pid of listListeningPids(port)) {
      if (shouldProtectProductionProcess(pid)) {
        continue;
      }
      if (stopProcessTree(pid, protectedPids)) {
        stopped.add(pid);
      }
    }
  }
  return stopped;
}

export async function stopStaleAgentGuiDev(options = {}) {
  const agentGuiRoot = options.agentGuiRoot ?? defaultAgentGuiRoot;
  const preferredPort = options.preferredPort ?? resolvePreferredPort();
  const protectedPids = listProtectedPids();
  const cleanupPorts = [
    preferredPort,
    ...new Set([3001, 3002].filter((port) => port !== preferredPort)),
  ];
  const productionPorts = listProductionOccupiedPorts(cleanupPorts);
  if (productionPorts.size > 0) {
    console.log(
      `agent-gui: leaving port(s) held by installed QuickerAgent: ${[...productionPorts].join(", ")}`,
    );
  }

  const stopped = new Set();

  for (const pid of listAgentGuiDevPids(agentGuiRoot)) {
    if (shouldProtectProductionProcess(pid)) {
      continue;
    }
    if (stopProcessTree(pid, protectedPids)) {
      stopped.add(pid);
    }
  }

  for (let round = 0; round < 4; round += 1) {
    for (const pid of stopPorts(cleanupPorts, protectedPids, productionPorts)) {
      stopped.add(pid);
    }
    if (round + 1 < 4) {
      await new Promise((resolveWait) => setTimeout(resolveWait, round === 0 ? 2000 : 750));
    }
  }

  const devServerJson = join(agentGuiRoot, ".local", "dev-server.json");
  if (existsSync(devServerJson)) {
    rmSync(devServerJson, { force: true });
  }

  const lingering = cleanupPorts.filter(
    (cleanupPort) => listListeningPids(cleanupPort).length > 0,
  );
  if (lingering.length > 0) {
    console.warn(
      `agent-gui: port(s) still in use after stop: ${lingering.join(", ")}`,
    );
  }

  if (stopped.size > 0) {
    console.log(
      `agent-gui: stopped prior dev (PID(s): ${[...stopped].join(", ")})`,
    );
  }

  return [...stopped];
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  stopStaleAgentGuiDev()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
