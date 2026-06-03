import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatStepRunnerGetMetaLine,
  formatStepRunnerSearchMetaLine,
  parseStepRunnerGetFromQkrpcData,
  parseStepRunnerGetInput,
  parseStepRunnerSearchFromQkrpcData,
} from "./step-runner-tool.ts";

test("parseStepRunnerGetInput reads key and optional controlField", () => {
  assert.deepEqual(parseStepRunnerGetInput({ key: "sys:csscript" }), {
    key: "sys:csscript",
  });
  assert.deepEqual(
    parseStepRunnerGetInput({ key: "sys:windowOperations", controlField: "move" }),
    { key: "sys:windowOperations", controlField: "move" },
  );
});

test("parseStepRunnerGetFromQkrpcData reads schemaJson payload", () => {
  const parsed = parseStepRunnerGetFromQkrpcData(
    {
      ok: true,
      action: "step-runner-get",
      payload: {
        success: true,
        schemaJson: JSON.stringify({
          StepRunnerKey: "sys:getClipboardText",
          Name: "获取剪贴板文本",
        }),
      },
    },
    { key: "sys:getClipboardText" },
  );
  assert.ok(parsed);
  assert.equal(parsed!.key, "sys:getClipboardText");
  assert.equal(parsed!.name, "获取剪贴板文本");
  assert.equal(
    formatStepRunnerGetMetaLine(parsed!),
    "sys:getClipboardText · 获取剪贴板文本",
  );
});

test("parseStepRunnerGetFromQkrpcData reads CLI schema object", () => {
  const parsed = parseStepRunnerGetFromQkrpcData(
    {
      ok: true,
      action: "step-runner-get",
      payload: {
        success: true,
        schema: {
          StepRunnerKey: "sys:subprogram",
          Name: "调用子程序",
        },
      },
    },
    { key: "sys:subprogram" },
  );
  assert.ok(parsed);
  assert.equal(formatStepRunnerGetMetaLine(parsed!), "sys:subprogram · 调用子程序");
});

test("parseStepRunnerSearchFromQkrpcData reads search payload", () => {
  const parsed = parseStepRunnerSearchFromQkrpcData(
    {
      ok: true,
      action: "step-runner-search",
      payload: {
        Success: true,
        Items: [{ Key: "sys:csscript" }, { Key: "sys:runScript" }],
      },
    },
    { query: "脚本" },
  );
  assert.ok(parsed);
  assert.equal(parsed!.matchCount, 2);
  assert.equal(formatStepRunnerSearchMetaLine(parsed!), "「脚本」 · 2 个模块");
});
