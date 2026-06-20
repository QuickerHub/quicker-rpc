import assert from "node:assert/strict";
import { test } from "node:test";
import {
  attachShellOutputArtifact,
  buildShellArtifactRelativePath,
  SHELL_ARTIFACT_THRESHOLD_CHARS,
} from "./shell-artifact";
import { runWithAgentRequestContextAsync } from "@/lib/qkrpc-request-context";

test("buildShellArtifactRelativePath uses thread and toolCallId segments", () => {
  assert.match(
    buildShellArtifactRelativePath({
      threadId: "thread-1",
      toolCallId: "call-abc",
    }),
    /\.local\/agent-artifacts\/thread-1\/call-abc\.txt$/,
  );
});

test("buildShellArtifactRelativePath reads threadId from request context", async () => {
  await runWithAgentRequestContextAsync(
    {
      threadId: "ctx-thread",
      artifactDir: ".local/agent-artifacts",
    },
    async () => {
      assert.match(
        buildShellArtifactRelativePath({ toolCallId: "call-1" }),
        /\.local\/agent-artifacts\/ctx-thread\/call-1\.txt$/,
      );
    },
  );
});

test("attachShellOutputArtifact returns null below threshold", async () => {
  const small = "x".repeat(SHELL_ARTIFACT_THRESHOLD_CHARS - 1);
  const result = await attachShellOutputArtifact(small, { toolCallId: "t1" });
  assert.equal(result, null);
});
