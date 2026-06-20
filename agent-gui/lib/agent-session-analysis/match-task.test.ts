import assert from "node:assert/strict";
import test from "node:test";

import { matchAuthoringBenchmarkTask } from "@/lib/agent-session-analysis/match-task";

const EXPORT_USER_PROMPT =
  "新建动作：变量 url（文本，默认空）。若 url 非空则 GET 该地址并把响应体写入 body；否则提示「请先设置 url」。有 url 时用文本窗口显示 body 前 200 字符。";

test("matchAuthoringBenchmarkTask prefers exact conditional-http-textwindow", () => {
  const matched = matchAuthoringBenchmarkTask(EXPORT_USER_PROMPT);
  assert.equal(matched?.id, "conditional-http-textwindow");
});

test("matchAuthoringBenchmarkTask matches shorter conditional-http-cache prompt", () => {
  const matched = matchAuthoringBenchmarkTask(
    "做一个动作：若动作变量 url 非空则 GET 该 url 并把响应体存入变量 body，否则提示用户先设置 url。",
  );
  assert.equal(matched?.id, "conditional-http-cache");
});
