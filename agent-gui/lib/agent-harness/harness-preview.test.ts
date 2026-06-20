import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  previewSlidingWindowHarness,
  previewShellArtifactHarness,
  previewListToolsRoutingHarness,
} from "./harness-preview";
import { runWithAgentRequestContextAsync } from "@/lib/qkrpc-request-context";

const fixtureCwd = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../benchmarks/fixtures/eval-workspace",
);

describe("harness-preview", () => {
  it("sliding-window preview trims old turn and keeps recent full", () => {
    const result = previewSlidingWindowHarness();
    assert.equal(result.kind, "sliding-window");
    assert.equal(result.applied, true);
    assert.ok(result.savedChars > 0);
    assert.equal(result.oldTurnPreviewed, true);
    assert.equal(result.recentTurnFull, true);
  });

  it("shell-artifact preview writes artifact and shrinks model payload", async () => {
    const result = await runWithAgentRequestContextAsync(
      { cwd: fixtureCwd },
      () => previewShellArtifactHarness({ toolCallId: "test-shell-artifact" }),
    );
    assert.equal(result.kind, "shell-artifact");
    assert.ok(result.artifactPath?.includes(".local/agent-artifacts/"));
    assert.ok(result.artifactPath?.includes("test-shell-artifact"));
    assert.ok(result.modelPayloadChars < result.displayDataChars);
    assert.ok(result.readHint?.includes(result.artifactPath ?? ""));
  });

  it("list-tools-routing preview compares compact prompt vs full table", () => {
    const result = previewListToolsRoutingHarness();
    assert.equal(result.kind, "list-tools-routing");
    assert.ok(result.compactPromptChars > 0);
    assert.ok(result.fullRoutingTableChars >= result.compactPromptChars);
    assert.ok(result.savedVsFull >= 0);
  });
});
