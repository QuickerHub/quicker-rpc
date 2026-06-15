import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  GUI_AGENT_DEFS_SCENARIO_IDS,
  GUI_LAUNCHER_SCENARIO_IDS,
  GUI_SMOKE_SCENARIO_IDS,
  loadEvalScenario,
  loadGuiScenarioCatalog,
  resolveScenarioWorkingDirectory,
} from "@/lib/agent-eval/eval-scenario";
import { evaluateTraceExpect } from "@/lib/agent-eval/trace-expect";

describe("agent-eval eval-scenario", () => {
  it("loads gui scenario catalog with unique ids", () => {
    const catalog = loadGuiScenarioCatalog();
    const ids = new Set<string>();
    for (const scenario of catalog.scenarios) {
      assert.ok(scenario.userPrompt.length >= 10, scenario.id);
      assert.ok(!ids.has(scenario.id), `duplicate id: ${scenario.id}`);
      ids.add(scenario.id);
    }
  });

  it("resolves authoring task by id", () => {
    const scenario = loadEvalScenario("discover-step-expr");
    assert.equal(scenario.source, "authoring");
    assert.equal(scenario.chatMode, "agent");
  });

  it("resolves gui scenario by id", () => {
    const scenario = loadEvalScenario("launcher-open-hotkeys");
    assert.equal(scenario.source, "agent-gui");
    assert.equal(scenario.chatMode, "launcher");
    assert.equal(scenario.expect?.launcher?.intent, "open-settings");
    assert.equal(
      scenario.expect?.launcher?.settingsOpen?.page,
      "FunctionHotkeys",
    );
  });

  it("preset id lists reference valid scenarios", () => {
    for (const id of GUI_LAUNCHER_SCENARIO_IDS) {
      loadEvalScenario(id);
    }
    for (const id of GUI_SMOKE_SCENARIO_IDS) {
      loadEvalScenario(id);
    }
    for (const id of GUI_AGENT_DEFS_SCENARIO_IDS) {
      loadEvalScenario(id);
    }
  });

  it("resolves fixture working directory", () => {
    const scenario = loadEvalScenario("slash-list-actions");
    const cwd = resolveScenarioWorkingDirectory(scenario);
    assert.ok(cwd.includes("benchmarks"));
    assert.ok(cwd.includes("eval-workspace"));
    assert.ok(existsSync(join(cwd, ".quicker", "commands", "list-actions.md")));
    assert.ok(existsSync(join(cwd, ".quicker", "agents", "readonly-explore.md")));
  });
});

describe("agent-eval trace-expect", () => {
  it("checks mustCall and mustNotCall", () => {
    const pass = evaluateTraceExpect(
      [
        { toolName: "launcher_resolve", state: "output-available" },
        { toolName: "quicker_settings", state: "output-available" },
      ],
      {
        mustCall: ["launcher_resolve"],
        mustNotCall: ["workspace_program"],
      },
    );
    assert.equal(pass.passed, true);

    const fail = evaluateTraceExpect(
      [{ toolName: "workspace_program", state: "output-available" }],
      { mustCall: ["launcher_resolve"] },
    );
    assert.equal(fail.passed, false);
  });

  it("checks mustCallAny", () => {
    const pass = evaluateTraceExpect(
      [{ toolName: "Read", state: "output-available" }],
      { mustCallAny: ["Grep", "Read"] },
    );
    assert.equal(pass.passed, true);

    const fail = evaluateTraceExpect(
      [{ toolName: "docs", state: "output-available" }],
      { mustCallAny: ["Grep", "Read"] },
    );
    assert.equal(fail.passed, false);
  });
});
