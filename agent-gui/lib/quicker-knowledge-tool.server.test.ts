import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { describe, it } from "node:test";

const require = createRequire(import.meta.url);
const serverOnlyPath = require.resolve("server-only");
require.cache[serverOnlyPath] = {
  id: serverOnlyPath,
  filename: serverOnlyPath,
  loaded: true,
  exports: {},
  children: [],
  paths: [],
};

describe("quicker knowledge tool", () => {
  it("returns input error for empty query", async () => {
    const { executeQuickerKnowledgeSearchTool } = await import(
      "@/lib/quicker-knowledge-tool.server"
    );
    const result = await executeQuickerKnowledgeSearchTool({ query: " " });
    assert.equal(result.ok, false);
    assert.match(String(result.error), /query is required/);
  });
});
