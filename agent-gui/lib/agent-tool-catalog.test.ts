import assert from "node:assert/strict";
import test from "node:test";
import { tool } from "ai";
import { z } from "zod";

import { validateAgentToolCatalog } from "@/lib/agent-tool-catalog";
import type { ToolMeta } from "@/lib/tool-registry";

const meta: ToolMeta = {
  id: "sample",
  label: "Sample",
  group: "read",
  category: "docs",
  description: "sample tool",
};

test("validateAgentToolCatalog accepts aligned metadata and definition", () => {
  const diagnostics = validateAgentToolCatalog([meta], {
    sample: tool({
      description: "sample",
      inputSchema: z.object({}),
      execute: async () => "ok",
    }),
  });
  assert.deepEqual(diagnostics, []);
});

test("validateAgentToolCatalog reports missing and unregistered tools", () => {
  const diagnostics = validateAgentToolCatalog([meta], {
    extra: tool({
      description: "extra",
      inputSchema: z.object({}),
      execute: async () => "ok",
    }),
  });
  assert.ok(diagnostics.some((item) => item.toolId === "sample"));
  assert.ok(diagnostics.some((item) => item.toolId === "extra"));
});

