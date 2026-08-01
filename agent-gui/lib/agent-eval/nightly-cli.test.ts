import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseAgentEvalNightlyArgs } from "@/lib/agent-eval/nightly-cli";

describe("agent-eval nightly-cli", () => {
  it("uses gui-smoke defaults", () => {
    assert.deepEqual(parseAgentEvalNightlyArgs([]), {
      preset: "gui-smoke",
      limit: undefined,
      skipLive: false,
      json: false,
      ui: false,
      headed: false,
    });
  });

  it("parses ui runner flags", () => {
    assert.deepEqual(
      parseAgentEvalNightlyArgs([
        "--preset",
        "gui-agent-defs",
        "--limit",
        "3",
        "--ui",
        "--headed",
        "--json",
      ]),
      {
        preset: "gui-agent-defs",
        limit: 3,
        skipLive: false,
        json: true,
        ui: true,
        headed: true,
      },
    );
  });
});
