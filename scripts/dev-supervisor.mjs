#!/usr/bin/env node
/**
 * Dev supervisor: foreground qkrpc + agent-gui with multiplexed logs and
 * automatic dev hot-update on source changes.
 *
 * Usage:
 *   node scripts/dev-supervisor.mjs
 *   node scripts/dev-supervisor.mjs --services qkrpc
 *   node scripts/dev-supervisor.mjs --no-watch
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAgentService } from "./dev-services/agent-service.mjs";
import { runHotUpdateBuild } from "./dev-services/hot-update-build.mjs";
import { supervisorLog } from "./dev-services/log-multiplexer.mjs";
import { createQkrpcService } from "./dev-services/qkrpc-service.mjs";
import { startHotUpdateWatch } from "./dev-services/watch-hot-update.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const agentGuiRoot = join(repoRoot, "agent-gui");

/** @param {string[]} argv */
function parseArgs(argv) {
  const services = new Set(["qkrpc", "agent"]);
  let watch = true;
  let fullRuntimes = false;
  let skipKill = false;
  let openBrowser = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--watch") watch = true;
    else if (arg === "--no-watch") watch = false;
    else if (arg === "--full") fullRuntimes = true;
    else if (arg === "--skip-kill") skipKill = true;
    else if (arg === "--open-browser") openBrowser = true;
    else if (arg === "--services") {
      services.clear();
      for (const id of (argv[++i] ?? "").split(",")) {
        const trimmed = id.trim();
        if (trimmed) services.add(trimmed);
      }
    } else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/dev-supervisor.mjs [options]

Options:
  --services qkrpc,agent   Services to start (default: both)
  --watch                  Enable automatic hot-update on file changes (default)
  --no-watch               Disable automatic hot-update
  --full                   Eager-start voice runtime (agent --full-runtimes)
  --skip-kill              Do not stop prior agent-gui dev on :3000
  --open-browser           Open http://127.0.0.1:3000 after agent is ready
`);
      process.exit(0);
    }
  }

  return { services, watch, fullRuntimes, skipKill, openBrowser };
}

/** @param {Record<string, unknown>} state */
function writeSupervisorState(state) {
  const dir = join(repoRoot, ".local");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "dev-supervisor.json"),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8",
  );
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const host = process.env.HOSTNAME?.trim() || "127.0.0.1";

  if (!existsSync(join(agentGuiRoot, "package.json"))) {
    throw new Error(`agent-gui not found under ${repoRoot}`);
  }

  const qkrpc = createQkrpcService({ repoRoot, agentGuiRoot, host });
  const agent = createAgentService({
    repoRoot,
    agentGuiRoot,
    qkrpcBaseUrl: "",
    fullRuntimes: opts.fullRuntimes,
    skipKill: opts.skipKill,
    openBrowser: opts.openBrowser,
  });

  let building = false;
  let pendingRebuild = false;
  let watchEnabled = opts.watch;
  /** @type {{ at: number; path: string } | null} */
  let lastHotUpdate = null;
  /** @type {(() => void) | null} */
  let stopWatch = null;
  const runHotUpdate = async (trigger) => {
    if (!opts.services.has("qkrpc")) return;
    if (building) {
      pendingRebuild = true;
      supervisorLog("watch", `queued rebuild (already building): ${trigger.path}`);
      return;
    }

    building = true;
    try {
      await qkrpc.stop();
      await runHotUpdateBuild(repoRoot, { reason: trigger.path });
      await qkrpc.restart();
      lastHotUpdate = { at: Date.now(), path: trigger.path };
      writeSupervisorState({
        supervisorPid: process.pid,
        updatedAt: Date.now(),
        watchEnabled,
        qkrpc: { url: qkrpc.getBaseUrl(), port: qkrpc.getPort() },
        lastHotUpdate,
      });
    } catch (err) {
      supervisorLog(
        "supervisor",
        `hot-update failed: ${err instanceof Error ? err.message : err}`,
      );
      if (!qkrpc.isRunning() && qkrpc.hasRuntime()) {
        try {
          await qkrpc.start();
        } catch (restartErr) {
          supervisorLog(
            "supervisor",
            `qkrpc restart after failed build: ${restartErr instanceof Error ? restartErr.message : restartErr}`,
          );
        }
      }
    } finally {
      building = false;
      if (pendingRebuild) {
        pendingRebuild = false;
        await runHotUpdate({ path: "(queued)", reason: "(queued)" });
      }
    }
  };

  supervisorLog("supervisor", `starting services: ${[...opts.services].join(", ")}`);

  if (opts.services.has("qkrpc")) {
    if (!qkrpc.hasRuntime()) {
      supervisorLog("supervisor", "qkrpc runtime missing — running initial build");
      await runHotUpdate({ path: "(bootstrap)", reason: "bootstrap" });
    } else {
      await qkrpc.start();
    }
  }

  if (opts.services.has("agent")) {
    if (!opts.services.has("qkrpc")) {
      const external = process.env.QKRPC_HTTP_URL?.trim() || "http://127.0.0.1:9477";
      await agent.start(external);
    } else {
      await agent.start(qkrpc.getBaseUrl());
    }
  }

  const persistSupervisorState = () => {
    writeSupervisorState({
      supervisorPid: process.pid,
      startedAt: Date.now(),
      services: [...opts.services],
      watchEnabled,
      qkrpc: opts.services.has("qkrpc")
        ? { url: qkrpc.getBaseUrl(), port: qkrpc.getPort() }
        : null,
      lastHotUpdate,
    });
  };

  const disableWatch = () => {
    stopWatch?.();
    stopWatch = null;
    watchEnabled = false;
  };

  if (watchEnabled && opts.services.has("qkrpc")) {
    stopWatch = startHotUpdateWatch({
      repoRoot,
      onHotUpdate: runHotUpdate,
    });
  }

  if (opts.services.has("qkrpc")) {
    persistSupervisorState();
  }

  supervisorLog(
    "supervisor",
    watchEnabled
      ? "ready — edit Plugin/CLI sources; hot-update runs automatically"
      : "ready — auto hot-update disabled (--no-watch)",
  );
  if (opts.services.has("agent")) {
    supervisorLog("supervisor", "agent UI: http://127.0.0.1:3000 (Ctrl+C to stop all)");
  }

  const shutdown = async () => {
    supervisorLog("supervisor", "shutting down…");
    disableWatch();
    await agent.stop();
    await qkrpc.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
