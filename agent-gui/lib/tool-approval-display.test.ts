import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApprovalDockCopy } from "./tool-approval-display.ts";

const actionDelete = (id: string) => ({
  id: `approval-${id}`,
  toolName: "qkrpc_action_delete",
  label: "删除动作",
  input: { id },
  destructive: true,
});

test("buildApprovalDockCopy aggregates action deletes", () => {
  const one = buildApprovalDockCopy([actionDelete("aaaa-bbbb-cccc-dddd-eeee")]);
  assert.equal(one.summary, "永久删除 1 个动作（aaaa-bbb…）");
  assert.equal(one.approveLabel, "确认删除");

  const many = buildApprovalDockCopy(
    Array.from({ length: 10 }, (_, index) =>
      actionDelete(`00000000-0000-0000-0000-${String(index).padStart(12, "0")}`),
    ),
  );
  assert.match(many.summary, /^永久删除 10 个动作/);
  assert.equal(many.approveLabel, "确认删除 10 项");
  assert.equal(many.denyLabel, "全部取消");
});

test("buildApprovalDockCopy adds workspace delete prompt when projects exist", () => {
  const copy = buildApprovalDockCopy(
    [actionDelete("aaaa-bbbb-cccc-dddd-eeee")],
    { workspaceActionProjectCount: 1 },
  );
  assert.ok(copy.workspaceDelete);
  assert.match(copy.workspaceDelete!.checkboxLabel, /工作区/);
  assert.match(copy.workspaceDelete!.detail ?? "", /Quicker 动作库/);
});

const subprogramDelete = (id: string) => ({
  id: `approval-sub-${id}`,
  toolName: "qkrpc_subprogram_delete",
  label: "删除子程序",
  input: { id },
  destructive: true,
});

test("buildApprovalDockCopy adds workspace delete prompt for subprograms", () => {
  const copy = buildApprovalDockCopy(
    [subprogramDelete("58830061-a69f-4306-83e3-5ffbab98471b")],
    { workspaceSubProgramProjectCount: 1 },
  );
  assert.ok(copy.workspaceDelete);
  assert.match(copy.workspaceDelete!.checkboxLabel, /\.quicker\/subprograms/);
  assert.match(copy.workspaceDelete!.detail ?? "", /公共子程序库/);
});
