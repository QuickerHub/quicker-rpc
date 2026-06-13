import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AUTHORING_BENCHMARK_TASKS,
  getAuthoringBenchmarkTask,
  groupAuthoringBenchmarkTasksByCategory,
  listAuthoringBenchmarkL2CoreTasks,
  listAuthoringBenchmarkTasksWithMockProfile,
  resolveMockProfileId,
  scoreAuthoringBenchmarkTask,
  summarizeAuthoringBenchmarkResults,
} from "@/lib/authoring-benchmark";

describe("authoring-benchmark", () => {
  it("has unique ids and natural-language userPrompt", () => {
    const ids = new Set<string>();
    for (const task of AUTHORING_BENCHMARK_TASKS) {
      assert.ok(task.id.length > 0);
      assert.ok(task.label.length > 0);
      assert.ok(task.hint.length > 0);
      assert.ok(task.userPrompt.length >= 10, task.id);
      assert.ok(!ids.has(task.id), `duplicate id: ${task.id}`);
      ids.add(task.id);
      assert.ok(
        !/qkrpc_step_runner_search|workspace_program patch/i.test(
          task.userPrompt,
        ),
        `tool names in userPrompt: ${task.id}`,
      );
    }
  });

  it("covers tiers L0–L4 and core L2 authoring tasks", () => {
    const tiers = new Set(AUTHORING_BENCHMARK_TASKS.map((t) => t.tier));
    for (const tier of ["L0", "L1", "L2", "L3", "L4"] as const) {
      assert.ok(tiers.has(tier), `missing tier ${tier}`);
    }
    const l2Core = listAuthoringBenchmarkL2CoreTasks();
    assert.ok(l2Core.length >= 6);
    assert.ok(l2Core.some((t) => t.id === "clip-lines-expr"));
  });

  it("groups all tasks by category", () => {
    const grouped = groupAuthoringBenchmarkTasksByCategory();
    const n = grouped.reduce((acc, g) => acc + g.items.length, 0);
    assert.equal(n, AUTHORING_BENCHMARK_TASKS.length);
  });

  it("scores tasks by weighted axes", () => {
    const task = getAuthoringBenchmarkTask("clip-lines-expr");
    assert.ok(task);
    const perfect = scoreAuthoringBenchmarkTask(task!, {
      A: 2,
      B: 2,
      C: 2,
      D: 2,
      F: 2,
    });
    assert.equal(perfect, 100);
    const weak = scoreAuthoringBenchmarkTask(task!, { A: 0, B: 0, C: 2, D: 2, F: 2 });
    assert.ok(weak < perfect);
  });

  it("summarizes benchmark pass thresholds", () => {
    const tasks = AUTHORING_BENCHMARK_TASKS.slice(0, 3);
    const results = tasks.map((t) => ({
      taskId: t.id,
      scores: Object.fromEntries(
        t.axes.map((a) => [a, 2 as const]),
      ) as Record<string, 0 | 1 | 2>,
    }));
    const summary = summarizeAuthoringBenchmarkResults(results);
    assert.equal(summary.overallPercent, 100);
    assert.equal(summary.passOverall, true);
  });

  it("resolves mock profile ids from verify block", () => {
    const withProfile = getAuthoringBenchmarkTask("clip-lines-expr");
    assert.ok(withProfile);
    assert.equal(resolveMockProfileId(withProfile!), "clip-lines-expr");
    const mockTasks = listAuthoringBenchmarkTasksWithMockProfile();
    assert.ok(mockTasks.length >= 5);
    assert.ok(mockTasks.every((t) => t.verify?.mockProfile));
  });
});
