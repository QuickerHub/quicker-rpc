import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { runWithQkrpcCwd } from "@/lib/qkrpc-request-context";
import { editWorkspaceFile } from "@/lib/workspace-fs";

test("editWorkspaceFile json-append-steps when oldString is empty steps anchor", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-gui-ws-json-"));
  try {
    await runWithQkrpcCwd(root, async () => {
      const content = JSON.stringify(
        {
          steps: [{ stepRunnerKey: "sys:delay", inputParams: {} }],
          variables: [],
        },
        null,
        2,
      );
      await writeFile(join(root, "data.json"), content, "utf8");
      const edit = await editWorkspaceFile(
        "data.json",
        JSON.stringify({ steps: [] }),
        JSON.stringify({
          steps: [{ stepRunnerKey: "sys:evalexpression", inputParams: {} }],
        }),
      );
      assert.equal(edit.ok, true);
      if (edit.ok) {
        assert.equal(edit.editStrategy, "json-append-steps");
      }
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("editWorkspaceFile stale empty template returns rich error", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-gui-ws-json-"));
  try {
    await runWithQkrpcCwd(root, async () => {
      await writeFile(
        join(root, "data.json"),
        JSON.stringify({
          steps: [{ stepRunnerKey: "x" }],
          variables: [{ key: "n" }],
        }),
        "utf8",
      );
      const edit = await editWorkspaceFile(
        "data.json",
        '{"steps":[],"variables":[]}',
        '{"steps":[],"variables":[{"key":"z"}]}',
      );
      assert.equal(edit.ok, false);
      if (!edit.ok) {
        assert.ok(edit.error.includes("already has content"));
        assert.ok(edit.error.includes("steps=1"));
      }
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
