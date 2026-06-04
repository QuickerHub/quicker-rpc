import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { runWithQkrpcCwdAsync } from "./qkrpc-request-context.ts";
import {
  displayNodeLabel,
  isEmbeddedSubProgramRootNode,
} from "./action-explorer-tree.ts";

test("buildActionExplorerTreeRoots returns project folders without file children", async () => {
  const root = join(tmpdir(), `qkrpc-explorer-roots-${Date.now()}`);
  const actionId = "846b4132-ad73-42e8-b2f9-c42fe718ae20";

  try {
    await mkdir(join(root, ".quicker", "actions", actionId, "files"), {
      recursive: true,
    });
    await writeFile(
      join(root, ".quicker", "actions", actionId, "info.json"),
      JSON.stringify({ id: actionId, title: "截图OCR" }, null, 2),
      "utf8",
    );
    await writeFile(
      join(root, ".quicker", "actions", actionId, "files", "http1.txt"),
      "GET",
      "utf8",
    );

    await runWithQkrpcCwdAsync(root, async () => {
      const { buildActionExplorerTreeRoots, buildActionExplorerTree } = await import(
        "./action-explorer-server.ts"
      );
      const roots = await buildActionExplorerTreeRoots();
      assert.equal(roots.ok, true);
      if (!roots.ok) return;
      assert.equal(roots.tree.children.length, 1);
      assert.equal(roots.tree.children[0]?.title, "截图OCR");
      assert.equal(roots.tree.children[0]?.children, undefined);

      const full = await buildActionExplorerTree();
      assert.equal(full.ok, true);
      if (!full.ok) return;
      assert.ok(
        (full.tree.children[0]?.children?.length ?? 0) > 0,
        "full tree should include nested files",
      );
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("buildActionExplorerTree loads embedded subprogram titles from info.json", async () => {
  const repoRoot = join(import.meta.dirname, "..", "..");
  const actionsRoot = join(repoRoot, ".quicker", "actions");
  try {
    const { access } = await import("node:fs/promises");
    await access(actionsRoot);
  } catch {
    return; // skip when fixture workspace absent
  }

  await runWithQkrpcCwdAsync(repoRoot, async () => {
    const { buildActionExplorerTree } = await import("./action-explorer-server.ts");
    const result = await buildActionExplorerTree();
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const subs: Array<{ label: string; title?: string }> = [];
    const walk = (nodes: import("./action-explorer-tree.ts").ExplorerTreeNode[]) => {
      for (const node of nodes) {
        if (isEmbeddedSubProgramRootNode(node)) {
          subs.push({ label: displayNodeLabel(node), title: node.title });
        }
        if (node.children?.length) walk(node.children);
      }
    };
    walk(result.tree.children);

    if (subs.length === 0) return;
    assert.ok(
      subs.some((s) => s.title && s.title !== "（无标题）"),
      `expected at least one titled subprogram, got: ${JSON.stringify(subs.slice(0, 3))}`,
    );
  });
});

test("buildActionExplorerTree loads embedded subprogram titles (temp fixture)", async () => {
  const root = join(tmpdir(), `qkrpc-explorer-sub-${Date.now()}`);
  const actionId = "846b4132-ad73-42e8-b2f9-c42fe718ae20";
  const subId = "039e60db-424c-4653-8798-01feb36b1aa0";
  const subDir = join(
    root,
    ".quicker",
    "actions",
    actionId,
    "subprograms",
    subId,
  );

  try {
    await mkdir(subDir, { recursive: true });
    await writeFile(
      join(root, ".quicker", "actions", actionId, "info.json"),
      JSON.stringify({ id: actionId, title: "截图OCR" }, null, 2),
      "utf8",
    );
    await writeFile(
      join(root, ".quicker", "actions", actionId, "data.json"),
      JSON.stringify({ steps: [], variables: [] }, null, 2),
      "utf8",
    );
    await writeFile(
      join(subDir, "info.json"),
      JSON.stringify(
        {
          Id: subId,
          Name: "查询使用记录",
          IsLocalEdited: true,
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(
      join(subDir, "data.json"),
      JSON.stringify({ steps: [], variables: [] }, null, 2),
      "utf8",
    );

    await runWithQkrpcCwdAsync(root, async () => {
      const { buildActionExplorerTree } = await import("./action-explorer-server.ts");
      const result = await buildActionExplorerTree();
      assert.equal(result.ok, true);
      if (!result.ok) return;

      let subRoot: import("./action-explorer-tree.ts").ExplorerTreeNode | undefined;
      const walk = (nodes: import("./action-explorer-tree.ts").ExplorerTreeNode[]) => {
        for (const node of nodes) {
          if (isEmbeddedSubProgramRootNode(node)) subRoot = node;
          if (node.children?.length) walk(node.children);
        }
      };
      walk(result.tree.children);

      assert.ok(subRoot, "expected embedded subprogram root node");
      assert.equal(displayNodeLabel(subRoot!), "查询使用记录");
      assert.equal(subRoot!.title, "查询使用记录");
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("buildSubProgramExplorerTreeRoots returns global subprogram projects", async () => {
  const root = join(tmpdir(), `qkrpc-sub-explorer-${Date.now()}`);
  const subName = "demo-sub";

  try {
    await mkdir(join(root, ".quicker", "subprograms", subName, "files"), {
      recursive: true,
    });
    await writeFile(
      join(root, ".quicker", "subprograms", subName, "info.json"),
      JSON.stringify(
        {
          Id: "%%abc",
          Name: "演示子程序",
          CallIdentifier: "%%abc",
        },
        null,
        2,
      ),
      "utf8",
    );

    await runWithQkrpcCwdAsync(root, async () => {
      const { buildSubProgramExplorerTreeRoots, buildSubProgramExplorerTree } =
        await import("./subprogram-explorer-server.ts");
      const { isGlobalSubProgramRootNode } = await import("./action-explorer-tree.ts");
      const roots = await buildSubProgramExplorerTreeRoots();
      assert.equal(roots.ok, true);
      if (!roots.ok) return;
      assert.equal(roots.tree.rootLabel, "公共子程序");
      assert.equal(roots.tree.children.length, 1);
      assert.equal(roots.tree.children[0]?.title, "演示子程序");
      assert.ok(isGlobalSubProgramRootNode(roots.tree.children[0]!));

      const full = await buildSubProgramExplorerTree();
      assert.equal(full.ok, true);
      if (!full.ok) return;
      assert.ok((full.tree.children[0]?.children?.length ?? 0) > 0);
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
