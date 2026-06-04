import assert from "node:assert/strict";
import test from "node:test";
import {
  injectEmbeddedSubProgramsIntoProjectTree,
  type ActionEmbeddedSubProgramMeta,
} from "./action-explorer-tree";

test("injectEmbeddedSubProgramsIntoProjectTree adds subprograms when file list omitted them", () => {
  const actionId = "846b4132-ad73-42e8-b2f9-c42fe718ae20";
  const projectPath = `.quicker/actions/${actionId}`;
  const subId = "039e60db-424c-4653-8798-01feb36b1aa0";
  const meta: ActionEmbeddedSubProgramMeta[] = [
    {
      path: `${projectPath}/subprograms/${subId}`,
      dirName: subId,
      title: "查询使用记录",
      subProgramId: subId,
    },
  ];

  const children = injectEmbeddedSubProgramsIntoProjectTree(projectPath, [], meta);
  const subRoot = children.find((n) => n.name === "subprograms");
  assert.ok(subRoot);
  assert.equal(subRoot!.children?.length, 1);
  assert.equal(subRoot!.children![0]!.title, "查询使用记录");
});
