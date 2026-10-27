import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { runWithQkrpcCwdAsync } from "./qkrpc-request-context.ts";
import {
  displayNodeLabel,
  isEmbeddedSubProgramRootNode,
} from "./action-explorer-tree.ts";

async function withSourceExplorerFixture(run: (root: string) => Promise<void>): Promise<void> {
  const fixtures = resolve(import.meta.dirname, "..", "..", ".tmp");
  await mkdir(fixtures, { recursive: true });
  const root = await mkdtemp(join(fixtures, "source-explorer-"));
  try { await run(root); }
  finally {
    assert.equal(dirname(root), fixtures, "cleanup must stay in this repository's owned .tmp fixture directory");
    await rm(root, { recursive: true, force: true });
  }
}

const sourceActionId = "4b625e36-8d72-4c60-a826-219e08bf9e51";
const legacyActionId = "d46ddf62-2496-4437-a323-b4f7bb975e60";
const sourceIdentity = (extra: Record<string, unknown> = {}) => JSON.stringify({
  schema: "quicker.source-bundle.v1", kind: "action", actionId: sourceActionId, title: "Actual source title", ...extra,
});

test("source project roots use actual sidecar identity and YAML entry without creating legacy mirrors", async () => {
  await withSourceExplorerFixture(async root => {
    const dirName = "friendly-source-folder", projectPath = `.quicker/actions/${dirName}`;
    const project = join(root, ".quicker", "actions", dirName);
    await mkdir(project, { recursive: true });
    const yaml = "$schema: quicker.program.source.v1\nsteps: []\nvariables: []\n";
    const identity = "\uFEFF" + sourceIdentity();
    await writeFile(join(project, "program.source.yaml"), yaml, "utf8");
    await writeFile(join(project, "quicker.source.json"), identity, "utf8");

    await runWithQkrpcCwdAsync(root, async () => {
      const { loadActionProjectMeta, listWorkspaceActionProjects, buildActionExplorerTreeRoots, buildActionExplorerTree } = await import("./action-explorer-server.ts");
      const expected = { dirName, path: projectPath, entryPath: `${projectPath}/program.source.yaml`, actionId: sourceActionId, title: "Actual source title" };
      assert.deepEqual(await loadActionProjectMeta(), [expected]);
      const listed = await listWorkspaceActionProjects();
      assert.ok(listed.ok); if (listed.ok) assert.deepEqual(listed.projects, [expected]);
      for (const result of [await buildActionExplorerTreeRoots(), await buildActionExplorerTree()]) {
        assert.ok(result.ok); if (!result.ok) continue;
        assert.equal(result.tree.children.length, 1);
        const node = result.tree.children[0]!;
        assert.equal(node.path, projectPath);
        assert.equal(node.entryPath, `${projectPath}/program.source.yaml`);
        assert.equal(node.actionId, sourceActionId);
        assert.equal(node.title, "Actual source title");
      }
    });
    assert.deepEqual((await readdir(project)).sort(), ["program.source.yaml", "quicker.source.json"]);
    assert.equal(await readFile(join(project, "program.source.yaml"), "utf8"), yaml);
    assert.equal(await readFile(join(project, "quicker.source.json"), "utf8"), identity);
  });
});

test("a valid source bundle wins over coexisting legacy metadata and a GUID-shaped folder name", async () => {
  await withSourceExplorerFixture(async root => {
    const projectPath = `.quicker/actions/${legacyActionId}`;
    const project = join(root, ".quicker", "actions", legacyActionId);
    await mkdir(project, { recursive: true });
    const legacy = JSON.stringify({ id: legacyActionId, title: "Legacy title", description: "legacy description", icon: "legacy icon" });
    await writeFile(join(project, "info.json"), legacy, "utf8");
    await writeFile(join(project, "data.json"), '{"steps":[],"variables":[]}', "utf8");
    await writeFile(join(project, "program.source.yaml"), "steps: []\n", "utf8");
    await writeFile(join(project, "quicker.source.json"), sourceIdentity(), "utf8");

    await runWithQkrpcCwdAsync(root, async () => {
      const { loadActionProjectMeta } = await import("./action-explorer-server.ts");
      assert.deepEqual(await loadActionProjectMeta(), [{ dirName: legacyActionId, path: projectPath,
        entryPath: `${projectPath}/program.source.yaml`, actionId: sourceActionId, title: "Actual source title" }]);
    });
    assert.equal(await readFile(join(project, "info.json"), "utf8"), legacy);
  });
});

test("invalid or incomplete source identities never select the source entry or override legacy metadata", async () => {
  await withSourceExplorerFixture(async root => {
    const cases = [
      { name: "schema", identity: sourceIdentity({ schema: "quicker.source-bundle.v2" }) },
      { name: "kind", identity: sourceIdentity({ kind: "subprogram" }) },
      { name: "id", identity: sourceIdentity({ actionId: "not-an-action-guid" }) },
      { name: "id-type", identity: sourceIdentity({ actionId: 123 }) },
      { name: "title-type", identity: sourceIdentity({ title: { title: "not a title string" } }) },
      { name: "array", identity: "[]" },
      { name: "malformed", identity: "{" },
      { name: "missing-identity", missingIdentity: true },
      { name: "missing-yaml", missingYaml: true },
      { name: "yaml-directory", yamlDirectory: true },
      { name: "identity-directory", identityDirectory: true },
    ];
    for (const fixture of cases) {
      const project = join(root, ".quicker", "actions", fixture.name);
      await mkdir(project, { recursive: true });
      await writeFile(join(project, "info.json"), JSON.stringify({ id: legacyActionId, title: `Legacy ${fixture.name}` }), "utf8");
      if (fixture.yamlDirectory) await mkdir(join(project, "program.source.yaml"));
      else if (!fixture.missingYaml) await writeFile(join(project, "program.source.yaml"), "steps: []\n", "utf8");
      if (fixture.identityDirectory) await mkdir(join(project, "quicker.source.json"));
      else if (!fixture.missingIdentity) await writeFile(join(project, "quicker.source.json"), fixture.identity ?? sourceIdentity(), "utf8");
    }

    await runWithQkrpcCwdAsync(root, async () => {
      const { loadActionProjectMeta } = await import("./action-explorer-server.ts");
      const projects = await loadActionProjectMeta();
      assert.equal(projects.length, cases.length);
      for (const fixture of cases) {
        const row = projects.find(project => project.dirName === fixture.name)!;
        assert.ok(row, fixture.name);
        assert.equal(row.entryPath, undefined, fixture.name);
        assert.equal(row.actionId, legacyActionId, fixture.name);
        assert.equal(row.title, `Legacy ${fixture.name}`, fixture.name);
      }
    });
  });
});

test("a valid source identity without a title does not borrow a legacy title or infer its action ID from the folder", async () => {
  await withSourceExplorerFixture(async root => {
    const project = join(root, ".quicker", "actions", legacyActionId);
    await mkdir(project, { recursive: true });
    await writeFile(join(project, "info.json"), JSON.stringify({ id: legacyActionId, title: "Must not leak into source title" }), "utf8");
    await writeFile(join(project, "program.source.yaml"), "steps: []\n", "utf8");
    await writeFile(join(project, "quicker.source.json"), sourceIdentity({ title: null }), "utf8");

    await runWithQkrpcCwdAsync(root, async () => {
      const { loadActionProjectMeta } = await import("./action-explorer-server.ts");
      const [row] = await loadActionProjectMeta();
      assert.equal(row?.actionId, sourceActionId);
      assert.equal(row?.title, undefined);
      assert.equal(row?.entryPath, `.quicker/actions/${legacyActionId}/program.source.yaml`);
    });
  });
});

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
      assert.equal(roots.tree.children[0]?.children?.length ?? 0, 0);

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
