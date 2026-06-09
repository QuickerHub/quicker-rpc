import assert from "node:assert/strict";
import test from "node:test";
import {
  isBundledProductionUiNodeProcess,
  isInstalledProductionQuickerAgentProcess,
  isProductionQuickerAgentUiProcess,
  normalizeProbePath,
  resolveInstalledQuickerAgentDirectory,
} from "./quicker-agent-install-probe.mjs";

test("installed production quicker-agent is not dev", () => {
  const cmd =
    "c:\\users\\me\\appdata\\local\\quickeragent\\quicker-agent.exe";
  assert.equal(
    isInstalledProductionQuickerAgentProcess("quicker-agent.exe", cmd),
    true,
  );
});

test("installed production quicker-agent matches forward-slash paths", () => {
  const exe =
    "C:/Users/me/AppData/Local/QuickerAgent/quicker-agent.exe";
  assert.equal(
    isInstalledProductionQuickerAgentProcess("quicker-agent.exe", "", exe),
    true,
  );
});

test("installed production quicker-agent matches executable path when cmd is empty", () => {
  const exe = "c:\\users\\me\\appdata\\local\\quickeragent\\quicker-agent.exe";
  assert.equal(
    isInstalledProductionQuickerAgentProcess("quicker-agent.exe", "", exe),
    true,
  );
});

test("installed production quicker-agent matches LOCALAPPDATA install root", () => {
  const installDir = resolveInstalledQuickerAgentDirectory();
  assert.ok(installDir);
  const exe = `${installDir.replace(/\\/g, "/")}/quicker-agent.exe`;
  assert.equal(
    isInstalledProductionQuickerAgentProcess("quicker-agent.exe", "", exe),
    true,
  );
});

test("repo tauri release build is dev, not installed production", () => {
  const cmd =
    "d:\\source\\repos\\quicker-rpc\\agent-gui\\src-tauri\\target\\release\\quicker-agent.exe";
  assert.equal(
    isInstalledProductionQuickerAgentProcess("quicker-agent.exe", cmd),
    false,
  );
});

test("bundled production node server is protected", () => {
  const cmd =
    '"c:\\users\\me\\appdata\\local\\quickeragent\\resources\\node\\node.exe" '
    + '"c:\\users\\me\\appdata\\local\\quickeragent\\resources\\app\\server.js"';
  assert.equal(isBundledProductionUiNodeProcess("node.exe", cmd), true);
});

test("bundled production node server matches forward-slash paths", () => {
  const cmd =
    "C:/Users/me/AppData/Local/QuickerAgent/resources/node/node.exe "
    + "C:/Users/me/AppData/Local/QuickerAgent/resources/app/server.js";
  assert.equal(isProductionQuickerAgentUiProcess("node.exe", cmd), true);
});

test("agent-gui next dev node is not bundled production", () => {
  const cmd =
    "d:\\source\\repos\\quicker-rpc\\agent-gui\\node_modules\\next\\dist\\bin\\next dev";
  assert.equal(isBundledProductionUiNodeProcess("node.exe", cmd), false);
});

test("normalizeProbePath unifies slash styles", () => {
  assert.equal(
    normalizeProbePath("C:/Users/x/QuickerAgent/quicker-agent.exe"),
    "c:\\users\\x\\quickeragent\\quicker-agent.exe",
  );
});
