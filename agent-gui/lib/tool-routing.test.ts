import assert from "node:assert/strict";
import { test } from "node:test";

import { TOOL_ROUTING_PROMPT, TOOL_ROUTING_TABLE } from "./tool-routing.ts";

const REQUIRED_INTENTS = [
  "Edit steps/vars/files on disk",
  "Read/write plain cwd file",
  "Quicker program body",
  "Review disk edits",
  "Post-patch syntax/lint",
  "Shell/build/test/git",
] as const;

test("TOOL_ROUTING_TABLE is markdown table with header and rows", () => {
  const lines = TOOL_ROUTING_TABLE.split("\n");
  assert.ok(lines[0]?.includes("User intent"));
  assert.ok(lines[1]?.includes("---"));
  assert.ok(lines.length >= REQUIRED_INTENTS.length + 2);
});

test("TOOL_ROUTING_PROMPT includes required workbench and workspace intents", () => {
  for (const intent of REQUIRED_INTENTS) {
    assert.ok(
      TOOL_ROUTING_PROMPT.includes(intent),
      `missing routing row for: ${intent}`,
    );
  }
});
