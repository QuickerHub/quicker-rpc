import assert from "node:assert/strict";
import { test } from "node:test";
import type { WorkspaceInstructions } from "./types.ts";
import {
  extractAgentsMdQuickRoutingSection,
  formatWorkspaceInstructionsCompactBlock,
  formatWorkspaceInstructionsForPrompt,
  isWorkspaceRulesFullInPromptEnabled,
  WORKSPACE_RULES_LARGE_CHARS,
  WORKSPACE_RULES_SUMMARY_CHARS,
} from "./workspace-instructions-format.ts";

test("isWorkspaceRulesFullInPromptEnabled defaults to compact rules", () => {
  const prev = process.env.HARNESS_WORKSPACE_RULES_FULL;
  delete process.env.HARNESS_WORKSPACE_RULES_FULL;
  assert.equal(isWorkspaceRulesFullInPromptEnabled(), false);
  process.env.HARNESS_WORKSPACE_RULES_FULL = "1";
  assert.equal(isWorkspaceRulesFullInPromptEnabled(), true);
  if (prev === undefined) delete process.env.HARNESS_WORKSPACE_RULES_FULL;
  else process.env.HARNESS_WORKSPACE_RULES_FULL = prev;
});

test("formatWorkspaceInstructionsCompactBlock keeps excerpt under summary budget", () => {
  const instructions: WorkspaceInstructions = {
    content: "x".repeat(WORKSPACE_RULES_SUMMARY_CHARS + 500),
    filePath: "D:/proj/AGENTS.md",
    truncated: false,
  };
  const block = formatWorkspaceInstructionsCompactBlock(instructions, "D:/proj");
  assert.ok(block.includes("AGENTS.md"));
  assert.ok(block.includes("Read for full"));
  assert.ok(block.includes("x".repeat(100)));
  assert.ok(!block.includes("x".repeat(WORKSPACE_RULES_SUMMARY_CHARS + 100)));
});

test("formatWorkspaceInstructionsForPrompt uses full block when enabled", () => {
  const prev = process.env.HARNESS_WORKSPACE_RULES_FULL;
  process.env.HARNESS_WORKSPACE_RULES_FULL = "1";
  const instructions: WorkspaceInstructions = {
    content: "full body",
    filePath: "AGENTS.md",
    truncated: false,
  };
  const block = formatWorkspaceInstructionsForPrompt(instructions);
  assert.ok(block.includes("full body"));
  assert.ok(block.includes("Workspace instructions"));
  if (prev === undefined) delete process.env.HARNESS_WORKSPACE_RULES_FULL;
  else process.env.HARNESS_WORKSPACE_RULES_FULL = prev;
});

test("extractAgentsMdQuickRoutingSection pulls routing table", () => {
  const md = [
    "# intro",
    "",
    "## Quick routing（改什么 → 做什么）",
    "",
    "| col | val |",
    "|-----|-----|",
    "| a | b |",
    "",
    "## Build",
    "build text",
  ].join("\n");
  const section = extractAgentsMdQuickRoutingSection(md);
  assert.ok(section?.includes("Quick routing"));
  assert.ok(section?.includes("| a | b |"));
  assert.ok(!section?.includes("Build"));
});

test("formatWorkspaceInstructionsCompactBlock preserves Quick routing on large AGENTS.md", () => {
  const routing = [
    "## Quick routing",
    "",
    "| route | action |",
    "|-------|--------|",
    "| plugin | build |",
  ].join("\n");
  const filler = "z".repeat(WORKSPACE_RULES_LARGE_CHARS + 100);
  const instructions: WorkspaceInstructions = {
    content: `${filler}\n\n${routing}\n\n## Tail\nend`,
    filePath: "D:/proj/AGENTS.md",
    truncated: false,
  };
  assert.ok(instructions.content.length >= WORKSPACE_RULES_LARGE_CHARS);
  const block = formatWorkspaceInstructionsCompactBlock(instructions, "D:/proj");
  assert.ok(block.includes("### Quick routing"));
  assert.ok(block.includes("| plugin | build |"));
});
