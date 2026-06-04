import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { runWithQkrpcCwdAsync } from "@/lib/qkrpc-request-context";
import {
  emptyProgramDataJsonContent,
  materializeProgramDataJsonIfNeeded,
  writeEmptyProgramDataJsonIfMissing,
} from "@/lib/workspace-project-disk";

test("emptyProgramDataJsonContent is valid empty program", () => {
  const parsed = JSON.parse(emptyProgramDataJsonContent()) as {
    steps: unknown[];
    variables: unknown[];
  };
  assert.deepEqual(parsed.steps, []);
  assert.deepEqual(parsed.variables, []);
});

test("materializeProgramDataJsonIfNeeded creates data.json when info exists", async () => {
  const root = await mkdtemp(join(tmpdir(), "qkrpc-mat-data-"));
  const subId = "58830061-a69f-4306-83e3-5ffbab98471b";
  const projectDir = `.quicker/subprograms/${subId}`;
  try {
    await mkdir(join(root, ...projectDir.split("/")), { recursive: true });
    await writeFile(
      join(root, projectDir, "info.json"),
      JSON.stringify({ Id: subId, Name: "test" }, null, 2),
      "utf8",
    );

    await runWithQkrpcCwdAsync(root, async () => {
      const created = await materializeProgramDataJsonIfNeeded(
        `${projectDir}/data.json`,
      );
      assert.equal(created, true);
      assert.equal(
        existsSync(join(root, projectDir, "data.json")),
        true,
      );
      const raw = await readFile(join(root, projectDir, "data.json"), "utf8");
      assert.equal(raw, emptyProgramDataJsonContent());
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writeEmptyProgramDataJsonIfMissing is idempotent", async () => {
  const root = await mkdtemp(join(tmpdir(), "qkrpc-empty-data-"));
  const projectDir = ".quicker/subprograms/demo";
  try {
    await runWithQkrpcCwdAsync(root, async () => {
      const first = await writeEmptyProgramDataJsonIfMissing(projectDir);
      assert.equal(first.ok, true);
      const second = await writeEmptyProgramDataJsonIfMissing(projectDir);
      assert.equal(second.ok, true);
      const raw = await readFile(join(root, projectDir, "data.json"), "utf8");
      assert.equal(raw, emptyProgramDataJsonContent());
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
