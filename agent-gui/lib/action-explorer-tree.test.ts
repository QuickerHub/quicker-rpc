import assert from "node:assert/strict";
import { test } from "node:test";
import {
  actionEmbeddedSubProgramDataJsonPath,
  actionProjectDataJsonPath,
  actionProjectInfoJsonPath,
  applyEmbeddedSubProgramMeta,
  buildExplorerTree,
  buildExplorerTreeFromProjectMeta,
  createActionExplorerTreeShell,
  displayNodeLabel,
  displayNodeSubtitle,
  findExplorerTreeNode,
  isActionProjectFolderNode,
  isActionProjectRootNode,
  isEmbeddedSubProgramRootNode,
  isExplorerTreeDirectoryPath,
  isHiddenExplorerTreeNode,
  resolveActionProjectId,
} from "./action-explorer-tree";

const ROOT = ".quicker/actions";
const ACTION_ID = "cbb222eb-9672-4892-ba29-355a70d6b912";

test("createActionExplorerTreeShell exposes empty actions root", () => {
  const shell = createActionExplorerTreeShell();
  assert.equal(shell.rootPath, ROOT);
  assert.equal(shell.rootLabel, "动作项目");
  assert.deepEqual(shell.children, []);
});

test("buildExplorerTree shows action title for guid directory", () => {
  const tree = buildExplorerTree(ROOT, [
    { path: `${ACTION_ID}/info.json`, kind: "file" },
    { path: `${ACTION_ID}/data.json`, kind: "file" },
  ], [
    {
      dirName: ACTION_ID,
      path: `${ROOT}/${ACTION_ID}`,
      title: "QuickerRpc 管理",
      actionId: ACTION_ID,
    },
  ]);

  assert.equal(tree.length, 1);
  const project = tree[0]!;
  assert.equal(project.name, ACTION_ID);
  assert.equal(project.title, "QuickerRpc 管理");
  assert.equal(displayNodeLabel(project, ROOT), "QuickerRpc 管理");
  assert.equal(displayNodeSubtitle(project, ROOT), null);
  assert.ok(isActionProjectRootNode(project, ROOT));
  const childNames = (project.children ?? []).map((c) => c.name);
  assert.ok(!childNames.includes("info.json"), "info.json is hidden in tree");
  assert.ok(!childNames.includes("data.json"), "data.json is hidden in tree");
});

test("displayNodeLabel uses untitled placeholder when info has no title", () => {
  const project = {
    name: ACTION_ID,
    path: `${ROOT}/${ACTION_ID}`,
    kind: "directory" as const,
    actionId: ACTION_ID,
  };
  assert.equal(displayNodeLabel(project, ROOT), "（无标题）");
  assert.equal(displayNodeSubtitle(project, ROOT), null);
});

test("buildExplorerTreeFromProjectMeta uses info.json meta for roots", () => {
  const tree = buildExplorerTreeFromProjectMeta(
    ROOT,
    [
      {
        dirName: ACTION_ID,
        path: `${ROOT}/${ACTION_ID}`,
        title: "From info only",
        actionId: ACTION_ID,
      },
    ],
    [],
  );
  assert.equal(tree.length, 1);
  assert.equal(displayNodeLabel(tree[0]!, ROOT), "From info only");
});

test("buildExplorerTreeFromProjectMeta attaches file children under meta root", () => {
  const tree = buildExplorerTreeFromProjectMeta(
    ROOT,
    [
      {
        dirName: ACTION_ID,
        path: `${ROOT}/${ACTION_ID}`,
        title: "QuickerRpc 管理",
        actionId: ACTION_ID,
      },
    ],
    [
      { path: `${ACTION_ID}/info.json`, kind: "file" },
      { path: `${ACTION_ID}/data.json`, kind: "file" },
    ],
  );
  const project = tree[0]!;
  assert.equal(displayNodeLabel(project, ROOT), "QuickerRpc 管理");
  const childNames = (project.children ?? []).map((c) => c.name);
  assert.ok(!childNames.includes("info.json"));
  assert.ok(!childNames.includes("data.json"));
});

test("buildExplorerTree supports legacy slug directory names", () => {
  const tree = buildExplorerTree(ROOT, [
    { path: "qkrpc-monitor/info.json", kind: "file" },
  ], [
    {
      dirName: "qkrpc-monitor",
      path: `${ROOT}/qkrpc-monitor`,
      title: "QuickerRpc 管理",
      actionId: ACTION_ID,
    },
  ]);

  const project = tree[0]!;
  assert.equal(displayNodeLabel(project, ROOT), "QuickerRpc 管理");
});

test("isHiddenExplorerTreeNode only for project info.json and data.json", () => {
  const project = {
    name: ACTION_ID,
    path: `${ROOT}/${ACTION_ID}`,
    kind: "directory" as const,
    title: "Test",
  };
  const info = {
    name: "info.json",
    path: `${ROOT}/${ACTION_ID}/info.json`,
    kind: "file" as const,
  };
  const data = {
    name: "data.json",
    path: `${ROOT}/${ACTION_ID}/data.json`,
    kind: "file" as const,
  };
  assert.equal(isHiddenExplorerTreeNode(info, project, ROOT), true);
  assert.equal(isHiddenExplorerTreeNode(data, project, ROOT), true);
  assert.equal(
    isHiddenExplorerTreeNode(
      { name: "info.json", path: `${ROOT}/${ACTION_ID}/files/info.json`, kind: "file" },
      { name: "files", path: `${ROOT}/${ACTION_ID}/files`, kind: "directory" },
      ROOT,
    ),
    false,
  );
});

test("resolveActionProjectId prefers meta id then guid dir name", () => {
  const guid = "b0a34daf-ab7e-4574-835c-85162375d932";
  assert.equal(
    resolveActionProjectId({
      name: guid,
      path: `${ROOT}/${guid}`,
      kind: "directory",
    }),
    guid,
  );
  assert.equal(
    resolveActionProjectId({
      name: "slug-name",
      path: `${ROOT}/slug-name`,
      kind: "directory",
      actionId: ACTION_ID,
    }),
    ACTION_ID,
  );
});

test("findExplorerTreeNode resolves nested directory", () => {
  const tree = {
    rootPath: ROOT,
    rootLabel: "动作项目",
    children: [
      {
        name: ACTION_ID,
        path: `${ROOT}/${ACTION_ID}`,
        kind: "directory" as const,
        children: [
          {
            name: "files",
            path: `${ROOT}/${ACTION_ID}/files`,
            kind: "directory" as const,
            children: [
              {
                name: "a.txt",
                path: `${ROOT}/${ACTION_ID}/files/a.txt`,
                kind: "file" as const,
              },
            ],
          },
        ],
      },
    ],
  };
  assert.equal(
    findExplorerTreeNode(tree, `${ROOT}/${ACTION_ID}/files`)?.kind,
    "directory",
  );
  assert.equal(
    findExplorerTreeNode(tree, `${ROOT}/${ACTION_ID}/files/a.txt`)?.name,
    "a.txt",
  );
  assert.equal(isExplorerTreeDirectoryPath(tree, `${ROOT}/${ACTION_ID}/files`), true);
  assert.equal(isExplorerTreeDirectoryPath(tree, `${ROOT}/${ACTION_ID}/files/a.txt`), false);
  assert.equal(
    isExplorerTreeDirectoryPath(null, `${ROOT}/${ACTION_ID}/files`),
    true,
  );
});

test("files folder is not project root even when actionsRoot param is project path", () => {
  const projectRoot = `${ROOT}/${ACTION_ID}`;
  const filesNode = {
    name: "files",
    path: `${projectRoot}/files`,
    kind: "directory" as const,
  };
  assert.equal(isActionProjectRootNode(filesNode, projectRoot), false);
  assert.equal(actionProjectInfoJsonPath(filesNode, projectRoot), null);
  assert.equal(isActionProjectFolderNode(filesNode), true);
});

test("actionProjectDataJsonPath for project root", () => {
  const node = {
    name: "foo",
    path: `${ROOT}/foo`,
    kind: "directory" as const,
  };
  assert.equal(actionProjectDataJsonPath(node, ROOT), `${ROOT}/foo/data.json`);
  assert.equal(
    actionProjectDataJsonPath({ name: "data.json", path: `${ROOT}/foo/data.json`, kind: "file" }, ROOT),
    null,
  );
});

test("actionProjectInfoJsonPath for project root", () => {
  const node = {
    name: "foo",
    path: `${ROOT}/foo`,
    kind: "directory" as const,
  };
  assert.equal(actionProjectInfoJsonPath(node, ROOT), `${ROOT}/foo/info.json`);
  assert.equal(
    actionProjectInfoJsonPath({ name: "data.json", path: `${ROOT}/foo/data.json`, kind: "file" }, ROOT),
    null,
  );
});

const SUB_ID = "039e60db-424c-4653-8798-01feb36b1aa0";

test("embedded subprogram root shows title and hides info/data.json", () => {
  const projectPath = `${ROOT}/${ACTION_ID}`;
  const subPath = `${projectPath}/subprograms/${SUB_ID}`;
  const meta = [
    {
      path: subPath,
      dirName: SUB_ID,
      title: "查询使用记录",
      subProgramId: SUB_ID,
    },
  ];
  const tree = buildExplorerTree(
    projectPath,
    [
      { path: `subprograms/${SUB_ID}/info.json`, kind: "file" },
      { path: `subprograms/${SUB_ID}/data.json`, kind: "file" },
      { path: `subprograms/${SUB_ID}/files/a.txt`, kind: "file" },
    ],
    [],
    meta,
  );
  const subRoot =
    tree.find((n) => n.name === "subprograms")?.children?.find((n) => n.name === SUB_ID);
  assert.ok(subRoot);
  assert.equal(displayNodeLabel(subRoot!, ROOT), "查询使用记录");
  assert.ok(isEmbeddedSubProgramRootNode(subRoot!));
  const childNames = (subRoot!.children ?? []).map((c) => c.name);
  assert.ok(!childNames.includes("info.json"));
  assert.ok(!childNames.includes("data.json"));
  assert.ok(childNames.includes("files"));
  assert.equal(actionEmbeddedSubProgramDataJsonPath(subRoot!), `${subPath}/data.json`);
});

test("applyEmbeddedSubProgramMeta enriches nested nodes", () => {
  const subPath = `${ROOT}/${ACTION_ID}/subprograms/${SUB_ID}`;
  const nodes: import("./action-explorer-tree").ExplorerTreeNode[] = [
    {
      name: SUB_ID,
      path: subPath,
      kind: "directory",
      children: [],
    },
  ];
  const enriched = applyEmbeddedSubProgramMeta(nodes, [
    {
      path: subPath,
      dirName: SUB_ID,
      title: "查询使用记录",
      subProgramId: SUB_ID,
    },
  ]);
  assert.equal(enriched[0]?.title, "查询使用记录");
  assert.equal(displayNodeLabel(enriched[0]!, ROOT), "查询使用记录");
});
