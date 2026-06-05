import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("appendLlmUsage aggregates totals per user and model", async () => {
  const previousRoot = process.env.AGENT_GUI_ROOT;
  const tempRoot = mkdtempSync(join(tmpdir(), "agent-gui-usage-"));
  process.env.AGENT_GUI_ROOT = tempRoot;

  try {
    const {
      appendLlmUsage,
      getLlmUsageForUser,
    } = await import("@/lib/llm-usage-store.server");

    appendLlmUsage({
      userId: "user-a",
      modelId: "gpt-5.5",
      source: "chat",
      inputTokens: 100,
      outputTokens: 20,
    });
    appendLlmUsage({
      userId: "user-a",
      modelId: "gpt-5.5",
      source: "title",
      inputTokens: 40,
      outputTokens: 8,
    });

    const record = getLlmUsageForUser("user-a");
    assert.ok(record);
    assert.equal(record.totals.inputTokens, 140);
    assert.equal(record.totals.outputTokens, 28);
    assert.equal(record.totals.totalTokens, 168);
    assert.equal(record.totals.requestCount, 2);
    assert.equal(record.byModel["gpt-5.5"]?.inputTokens, 140);
    assert.equal(record.recentEvents.length, 2);
    assert.equal(record.recentEvents[0]?.source, "title");
  } finally {
    if (previousRoot === undefined) {
      delete process.env.AGENT_GUI_ROOT;
    } else {
      process.env.AGENT_GUI_ROOT = previousRoot;
    }
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
