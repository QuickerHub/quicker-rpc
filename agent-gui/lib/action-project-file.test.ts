import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  resolveActionProjectFileForTool,
  validateActionProjectResourceRelativePath,
} from "@/lib/action-project-file.server";
import { runWithQkrpcCwd } from "@/lib/qkrpc-request-context";

const ACTION_ID = "2ba81451-4088-4b9e-92cb-8584ee6cb207";

test("validateActionProjectResourceRelativePath requires files/ under project", () => {
  assert.equal(validateActionProjectResourceRelativePath("files/main.cs").ok, true);
  assert.equal(
    validateActionProjectResourceRelativePath("files/clip.eval.cs").ok,
    true,
  );

  const rootFiles = validateActionProjectResourceRelativePath("files/");
  assert.equal(rootFiles.ok, false);

  const bare = validateActionProjectResourceRelativePath("main.cs");
  assert.equal(bare.ok, false);
  if (!bare.ok) {
    assert.match(bare.error, /start with files\//);
  }

  const quicker = validateActionProjectResourceRelativePath(
    ".quicker/actions/x/files/main.cs",
  );
  assert.equal(quicker.ok, false);

  const dataJson = validateActionProjectResourceRelativePath("data.json");
  assert.equal(dataJson.ok, false);
});

test("resolveActionProjectFileForTool maps id + files/ to .quicker/actions project", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-project-file-"));
  try {
    const projectDir = join(root, ".quicker", "actions", ACTION_ID);
    await mkdir(join(projectDir, "files"), { recursive: true });
    await writeFile(
      join(projectDir, "info.json"),
      `${JSON.stringify({ id: ACTION_ID, title: "Test", editVersion: 1 }, null, 2)}\n`,
      "utf8",
    );

    await runWithQkrpcCwd(root, async () => {
      const resolved = await resolveActionProjectFileForTool(
        ACTION_ID,
        "files/wait-clipboard-log.cs",
      );
      assert.equal(resolved.ok, true);
      if (resolved.ok) {
        assert.equal(
          resolved.resolved.path,
          `.quicker/actions/${ACTION_ID}/files/wait-clipboard-log.cs`,
        );
        assert.equal(resolved.resolved.resourcePath, "files/wait-clipboard-log.cs");
      }
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
