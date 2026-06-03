import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import {
  actionProjectDirFromName,
  findActionProjectDirectory,
} from "@/lib/action-project-path";
import { runWithQkrpcCwd } from "@/lib/qkrpc-request-context";
import {
  editWorkspaceFile,
  readWorkspaceFile,
  resolveWorkspacePath,
} from "@/lib/workspace-fs";

const ACTION_ID = "cbb222eb-9672-4892-ba29-355a70d6b912";

async function writeNamedProject(
  root: string,
  directoryName: string,
  actionId: string,
): Promise<string> {
  const projectDir = actionProjectDirFromName(directoryName);
  const absProject = join(root, ...projectDir.split("/"));
  await mkdir(join(absProject, "files"), { recursive: true });

  await writeFile(
    join(absProject, "info.json"),
    `${JSON.stringify(
      {
        id: actionId,
        title: "QuickerRpc Monitor",
        editVersion: 1,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await writeFile(
    join(absProject, "data.json"),
    `${JSON.stringify(
      {
        steps: [
          {
            stepId: "s-1",
            stepRunnerKey: "sys:csscript",
            inputParams: { code: { file: "files/csscript1.cs" } },
          },
        ],
        variables: [],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  await writeFile(join(absProject, "files", "csscript1.cs"), "return 1;\n", "utf8");
  return projectDir;
}

test("findActionProjectDirectory locates project by info.json id", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-gui-catalog-"));
  try {
    await writeNamedProject(root, "qkrpc-monitor", ACTION_ID);

    await runWithQkrpcCwd(root, async () => {
      const found = await findActionProjectDirectory(ACTION_ID);
      assert.equal(found, ".quicker/actions/qkrpc-monitor");
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workspace edit roundtrip: agent edits exported script file on disk", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-gui-project-rt-"));
  try {
    const projectDir = await writeNamedProject(root, "my-action", ACTION_ID);

    await runWithQkrpcCwd(root, async () => {
      const scriptRel = `${projectDir}/files/csscript1.cs`;
      const resolved = resolveWorkspacePath(scriptRel);
      assert.equal(resolved.ok, true);

      const edit = await editWorkspaceFile(scriptRel, "return 1;", "return 42;");
      assert.equal(edit.ok, true);

      const after = await readWorkspaceFile(scriptRel);
      assert.equal(after.ok, true);
      if (after.ok) {
        assert.equal(after.content.trim(), "return 42;");
      }
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("findActionProjectDirectory matches PascalCase Id in info.json", async () => {
  const actionId = "af193834-cc63-4d79-b6f3-db555560b366";
  const root = await mkdtemp(join(tmpdir(), "pascal-info-"));
  try {
    const absProject = join(root, ".quicker", "actions", actionId);
    await mkdir(join(absProject, "files"), { recursive: true });
    await writeFile(
      join(absProject, "info.json"),
      `${JSON.stringify({ Id: actionId, Title: "Test", EditVersion: 1 }, null, 2)}\n`,
      "utf8",
    );

    await runWithQkrpcCwd(root, async () => {
      const found = await findActionProjectDirectory(actionId);
      assert.equal(found, `.quicker/actions/${actionId}`);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("findActionProjectDirectory tolerates UTF-8 BOM in info.json", async () => {
  const actionId = "af193834-cc63-4d79-b6f3-db555560b366";
  const root = await mkdtemp(join(tmpdir(), "bom-info-"));
  try {
    const absProject = join(root, ".quicker", "actions", actionId);
    await mkdir(join(absProject, "files"), { recursive: true });
    await writeFile(
      join(absProject, "info.json"),
      `\uFEFF${JSON.stringify({ Id: actionId, Title: "Test", EditVersion: 1 }, null, 2)}\n`,
      "utf8",
    );

    await runWithQkrpcCwd(root, async () => {
      const found = await findActionProjectDirectory(actionId);
      assert.equal(found, `.quicker/actions/${actionId}`);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("workspace project layout uses readable directory name", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-gui-project-rt-"));
  try {
    const projectDir = await writeNamedProject(root, "qkrpc-monitor", ACTION_ID);
    assert.equal(projectDir, ".quicker/actions/qkrpc-monitor");

    await runWithQkrpcCwd(root, async () => {
      const data = await readWorkspaceFile(`${projectDir}/data.json`);
      assert.equal(data.ok, true);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
