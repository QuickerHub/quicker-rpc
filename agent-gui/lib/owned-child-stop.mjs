import { spawn } from "node:child_process";

/** Never block the event loop which must observe the owned child's exit. */
export async function requestOwnedChildTreeStop(child) {
  if (!child?.pid || child.exitCode != null || child.signalCode != null) return true;
  if (child.connected) {
    return new Promise((resolve) => child.send("shutdown", (error) => resolve(!error)));
  }
  if (process.platform !== "win32") {
    try { return process.kill(-child.pid, "SIGTERM") !== false; }
    catch { try { return child.kill("SIGTERM"); } catch { return false; } }
  }
  return new Promise((resolve) => {
    const command = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    let finished = false;
    const done = (accepted) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(accepted);
    };
    const timer = setTimeout(() => { command.kill(); done(false); }, 1500);
    command.once("error", () => done(false));
    command.once("exit", (code) => done(code === 0 || child.exitCode != null || child.signalCode != null));
  });
}
