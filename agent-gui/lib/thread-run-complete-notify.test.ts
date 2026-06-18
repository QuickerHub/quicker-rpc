import assert from "node:assert/strict";
import test from "node:test";
import { buildThreadRunCompleteToast } from "@/lib/thread-run-complete-notify";

test("buildThreadRunCompleteToast: success when idle with no pending input", () => {
  const toast = buildThreadRunCompleteToast({
    threadId: "t1",
    threadTitle: "Fix login bug",
    status: "ready",
    pendingApprovalCount: 0,
    pendingAskQuestionCount: 0,
    onActivate: () => {},
  });
  assert.equal(toast.kind, "success");
  assert.equal(toast.title, "Fix login bug");
  assert.match(toast.body, /已完成/);
});

test("buildThreadRunCompleteToast: warning when approvals pending", () => {
  const toast = buildThreadRunCompleteToast({
    threadId: "t1",
    threadTitle: "",
    status: "ready",
    pendingApprovalCount: 2,
    pendingAskQuestionCount: 0,
    onActivate: () => {},
  });
  assert.equal(toast.kind, "warning");
  assert.equal(toast.title, "新对话");
  assert.match(toast.body, /等待确认 2 个操作/);
});

test("buildThreadRunCompleteToast: error state", () => {
  const toast = buildThreadRunCompleteToast({
    threadId: "t1",
    threadTitle: "Run",
    status: "error",
    pendingApprovalCount: 0,
    pendingAskQuestionCount: 0,
    onActivate: () => {},
  });
  assert.equal(toast.kind, "error");
  assert.match(toast.body, /出错/);
});
