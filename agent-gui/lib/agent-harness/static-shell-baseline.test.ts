import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STATIC_SHELL_SYSTEM_TARGET_TOKENS,
  segmentFromText,
  summarizeStaticShellBaseline,
} from "./static-shell-baseline";

describe("static-shell-baseline", () => {
  it("segmentFromText estimates tokens from chars", () => {
    const segment = segmentFromText("test", "Test", "abcd");
    assert.equal(segment.chars, 4);
    assert.equal(segment.tokens, 1);
  });

  it("summarizeStaticShellBaseline computes totals and targets", () => {
    const report = summarizeStaticShellBaseline({
      cwd: ".",
      chatMode: "agent",
      harnessFlags: {
        preloadSkillsFull: false,
        workspaceRulesFull: false,
        toolResultCompression: true,
        slimToolSchemas: false,
      },
      segments: [
        { id: "a", label: "A", chars: 100, tokens: 25 },
        { id: "b", label: "B", chars: 100, tokens: 25 },
      ],
      systemPrompt: "x".repeat(STATIC_SHELL_SYSTEM_TARGET_TOKENS * 4 + 4),
      tools: {
        docs: { description: "d".repeat(400), inputSchema: { type: "object" } },
      },
      enabledToolIds: ["docs"],
    });

    assert.equal(report.targets.systemWithinTarget, false);
    assert.ok(report.systemPromptTokens >= STATIC_SHELL_SYSTEM_TARGET_TOKENS);
    assert.ok(report.toolDefinitionTokens > 0);
    assert.equal(
      report.totalStaticTokens,
      report.systemPromptTokens + report.toolDefinitionTokens,
    );
  });
});
