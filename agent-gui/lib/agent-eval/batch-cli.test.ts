import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseAgentEvalBatchArgs } from "@/lib/agent-eval/batch-cli";

describe("agent-eval batch-cli", () => {
  it("parses preset, limit, and ui runner flags", () => {
    assert.deepEqual(
      parseAgentEvalBatchArgs([
        "--preset",
        "gui-smoke",
        "--limit",
        "2",
        "--ui",
        "--headed",
        "--json",
      ]),
      {
        ids: undefined,
        tier: undefined,
        preset: "gui-smoke",
        limit: 2,
        json: true,
        verifyMock: false,
        ui: true,
        headed: true,
      },
    );
  });

  it("parses positional scenario ids without swallowing option values", () => {
    assert.deepEqual(
      parseAgentEvalBatchArgs([
        "discover-step-expr",
        "--tier",
        "l2",
        "clip-lines-expr",
        "--verify-mock",
      ]),
      {
        ids: ["discover-step-expr", "clip-lines-expr"],
        tier: "l2",
        preset: undefined,
        limit: undefined,
        json: false,
        verifyMock: true,
        ui: false,
        headed: false,
      },
    );
  });
});
