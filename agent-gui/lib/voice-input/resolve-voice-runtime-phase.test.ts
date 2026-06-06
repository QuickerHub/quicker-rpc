import assert from "node:assert/strict";
import test from "node:test";
import { resolveVoiceRuntimePhase } from "./resolve-voice-runtime-phase.ts";

test("resolveVoiceRuntimePhase ignores external health when plugin is not installed", () => {
  assert.equal(
    resolveVoiceRuntimePhase({
      hostStatus: {
        status: "not_installed",
        installed: false,
        running: false,
        wsPort: 0,
        pluginDir: null,
        message: "未安装",
      },
      health: {
        ok: true,
        protocolVersion: 1,
        modelLoaded: true,
        ready: true,
      },
      inTauri: true,
    }),
    "not_installed",
  );
});

test("resolveVoiceRuntimePhase reports running only when installed and ready", () => {
  assert.equal(
    resolveVoiceRuntimePhase({
      hostStatus: {
        status: "installed",
        installed: true,
        running: false,
        wsPort: 6016,
        pluginDir: "C:/voice",
        message: null,
      },
      health: {
        ok: true,
        protocolVersion: 1,
        modelId: "sensevoice",
        modelLoaded: true,
        ready: true,
      },
      inTauri: true,
    }),
    "running",
  );
});

test("resolveVoiceRuntimePhase rejects stub or unloaded model health", () => {
  assert.equal(
    resolveVoiceRuntimePhase({
      hostStatus: {
        status: "running",
        installed: true,
        running: true,
        wsPort: 6016,
        pluginDir: "C:/voice",
        message: null,
      },
      health: {
        ok: true,
        protocolVersion: 1,
        modelId: "stub",
        modelLoaded: false,
        ready: true,
      },
      inTauri: true,
    }),
    "starting",
  );
});

test("resolveVoiceRuntimePhase allows external dev runtime when enabled", () => {
  assert.equal(
    resolveVoiceRuntimePhase({
      hostStatus: {
        status: "not_installed",
        installed: false,
        running: false,
        wsPort: 0,
        pluginDir: null,
        message: null,
      },
      health: {
        ok: true,
        protocolVersion: 1,
        modelId: "sensevoice",
        modelLoaded: true,
        ready: true,
      },
      inTauri: false,
      allowExternalDevRuntime: true,
    }),
    "running",
  );
});
