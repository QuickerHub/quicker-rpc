import { spawn } from "node:child_process";
import { stopStaleAgentGuiDev } from "../../agent-gui/scripts/stop-agent-gui-dev.mjs";
import { attachTaggedLogs } from "./log-multiplexer.mjs";

/**
 * @typedef {{
 *   repoRoot: string;
 *   agentGuiRoot: string;
 *   qkrpcBaseUrl: string;
 *   fullRuntimes?: boolean;
 *   skipKill?: boolean;
 *   openBrowser?: boolean;
 * }} AgentServiceOptions
 */

export function createAgentService(options) {
  const agentGuiRoot = options.agentGuiRoot;
  const repoRoot = options.repoRoot;

  /** @type {import('node:child_process').ChildProcess | null} */
  let child = null;

  async function preparePort() {
    if (!options.skipKill) {
      await stopStaleAgentGuiDev({ agentGuiRoot, repoRoot });
    }
  }

  async function start(qkrpcBaseUrl) {
    await stop();
    await preparePort();

    const args = ["start.mjs", "--dev"];
    if (options.fullRuntimes) {
      args.push("--full-runtimes");
    }
    if (options.openBrowser) {
      args.push("--open-browser");
    }

    const env = {
      ...process.env,
      AGENT_GUI_SKIP_QKRPC: "1",
      QKRPC_HTTP_URL: qkrpcBaseUrl,
      QKRPC_TRANSPORT: "http",
      AGENT_GUI_SKIP_KILL: "1",
      DEV_SUPERVISOR: "1",
    };

    child = spawn(process.execPath, args, {
      cwd: agentGuiRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env,
      windowsHide: true,
    });
    attachTaggedLogs(child, "agent");

    child.on("exit", (code, signal) => {
      if (code !== 0 && code !== null && signal !== "SIGTERM") {
        console.error(
          `[agent] exited (code=${code ?? "null"}, signal=${signal ?? "null"})`,
        );
      }
      child = null;
    });

    return { pid: child.pid };
  }

  async function stop() {
    if (child?.pid && !child.killed) {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 4000);
        child?.once("exit", () => {
          clearTimeout(timer);
          resolve(undefined);
        });
      });
      if (child && child.exitCode == null) {
        child.kill("SIGKILL");
      }
    }
    child = null;
  }

  return {
    start,
    stop,
    isRunning: () => child != null && child.exitCode == null,
  };
}
