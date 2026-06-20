import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CORE_TOOL_ROUTING_TABLE,
  TOOL_ROUTING_PROMPT,
  TOOL_ROUTING_TABLE,
} from "./tool-routing.ts";

const REQUIRED_CORE_INTENTS = [
  "Edit steps/vars/files on disk",
  "Read plain cwd file",
  "Quicker program body",
  "Run action",
  "Debug / step output",
] as const;

const EXTENDED_INTENTS = [
  "Float popup",
  "Open designer UI (action/subprogram)",
  "Chat LLM profiles",
] as const;

test("TOOL_ROUTING_PROMPT inlines core routing table", () => {
  for (const intent of REQUIRED_CORE_INTENTS) {
    assert.ok(
      TOOL_ROUTING_PROMPT.includes(intent),
      `prompt missing core intent: ${intent}`,
    );
  }
  assert.ok(TOOL_ROUTING_PROMPT.includes(CORE_TOOL_ROUTING_TABLE));
});

test("TOOL_ROUTING_PROMPT documents list_tools bundles for specialized packs", () => {
  assert.ok(TOOL_ROUTING_PROMPT.includes("list_tools"));
  assert.ok(TOOL_ROUTING_PROMPT.includes("action=bundles"));
  assert.ok(TOOL_ROUTING_PROMPT.includes("action_authoring"));
});

test("extended intents stay in full table but not in core table", () => {
  for (const intent of EXTENDED_INTENTS) {
    assert.ok(TOOL_ROUTING_TABLE.includes(intent), `full table missing: ${intent}`);
    assert.equal(
      CORE_TOOL_ROUTING_TABLE.includes(intent),
      false,
      `core table should not include extended: ${intent}`,
    );
  }
});
