import assert from "node:assert/strict";
import { test } from "node:test";

import { qkrpcRequestContext } from "@/lib/qkrpc-request-context";
import {
  incrementStepRunnerSearchCountThisTurn,
} from "@/lib/program-turn-context";
import { suggestStepRunnerOrQuery } from "@/lib/agent-skills/skill-intent-preload";
import {
  consumeStepRunnerOrSearchRetry,
  noteFirstStepRunnerSearchQuery,
} from "@/lib/step-runner-search-cache";
import { evaluateStepRunnerSearchGuard } from "@/lib/step-runner-search-guard";

test("suggestStepRunnerOrQuery returns clipboard OR query", () => {
  const query = suggestStepRunnerOrQuery(["quicker-authoring-clipboard-pipeline"]);
  assert.ok(query?.includes("getClipboardText"));
  assert.ok(query?.includes("|"));
});

test("evaluateStepRunnerSearchGuard blocks second search for clipboard prompt", () => {
  const userText =
    "做一个动作：读取剪贴板文本，去掉空行、按行去重、按字母序排序后写回剪贴板，并提示处理前后的行数。";
  qkrpcRequestContext.run({ threadId: "t-search-guard", lastUserText: userText }, () => {
    incrementStepRunnerSearchCountThisTurn();
    const guard = evaluateStepRunnerSearchGuard("writeClipboard");
    assert.equal(guard.block, true);
    if (guard.block) {
      assert.ok(guard.orQuery.includes("getClipboardText"));
    }
  });
});

test("evaluateStepRunnerSearchGuard hints OR query on first single-key search", () => {
  const userText =
    "做一个动作：读取剪贴板文本，去掉空行、按行去重、按字母序排序后写回剪贴板，并提示处理前后的行数。";
  qkrpcRequestContext.run({ threadId: "t-search-hint", lastUserText: userText }, () => {
    const guard = evaluateStepRunnerSearchGuard("getClipboardText");
    assert.equal(guard.block, false);
    if (!guard.block) {
      assert.ok(guard.orQueryHint?.includes("|"));
    }
  });
});

test("evaluateStepRunnerSearchGuard allows one OR retry after single-key search", () => {
  const userText =
    "做一个动作：读取剪贴板文本，去掉空行、按行去重、按字母序排序后写回剪贴板，并提示处理前后的行数。";
  qkrpcRequestContext.run({ threadId: "t-or-retry", lastUserText: userText }, () => {
    incrementStepRunnerSearchCountThisTurn();
    noteFirstStepRunnerSearchQuery("t-or-retry", "getClipboardText");
    const guard = evaluateStepRunnerSearchGuard(
      "getClipboardText|writeClipboard|evalexpression|notify",
    );
    assert.equal(guard.block, false);
  });
});

test("evaluateStepRunnerSearchGuard blocks third search after OR retry consumed", () => {
  const userText =
    "做一个动作：读取剪贴板文本，去掉空行、按行去重、按字母序排序后写回剪贴板，并提示处理前后的行数。";
  qkrpcRequestContext.run({ threadId: "t-or-retry-block", lastUserText: userText }, () => {
    incrementStepRunnerSearchCountThisTurn();
    noteFirstStepRunnerSearchQuery("t-or-retry-block", "getClipboardText");
    consumeStepRunnerOrSearchRetry("t-or-retry-block");
    incrementStepRunnerSearchCountThisTurn();
    const guard = evaluateStepRunnerSearchGuard("writeClipboard");
    assert.equal(guard.block, true);
  });
});

test("evaluateStepRunnerSearchGuard allows multiple searches for getquicker scrape prompt", () => {
  const userText =
    "做一个 Quicker 动作，不要弹窗或文本窗口。运行时用 `{quicker_in_param}` 接收 getquicker 用户分享页链接。"
    + "抓取该用户全部公开动作（含分页），把获赞总数写入输出变量 `totalLikes`，动作个数写入 `actionCount`。";
  qkrpcRequestContext.run({ threadId: "t-getquicker", lastUserText: userText }, () => {
    incrementStepRunnerSearchCountThisTurn();
    noteFirstStepRunnerSearchQuery("t-getquicker", "sys:http");
    const guard = evaluateStepRunnerSearchGuard("regexExtract|each");
    assert.equal(guard.block, false);
  });
});
