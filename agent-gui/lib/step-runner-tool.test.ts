import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatStepRunnerGetMetaLine,
  formatStepRunnerSearchMetaLine,
  parseStepRunnerGetFromQkrpcData,
  parseStepRunnerGetInput,
  parseStepRunnerSearchFromQkrpcData,
  parseStepRunnerSearchResult,
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

test("parseStepRunnerSearchResult normalizes item rows for popup table", () => {
  const parsed = parseStepRunnerSearchResult(
    {
      ok: true,
      action: "step-runner-search",
      payload: {
        success: true,
        keyword: "表达式",
        matchCount: 2,
        items: [
          {
            key: "sys:evalexpression",
            name: "执行表达式",
            description: "执行C#表达式或脚本代码",
          },
          { Key: "sys:csscript", Name: "运行C#脚本" },
        ],
      },
    },
    { query: "表达式", limit: 5 },
  );
  assert.ok(parsed);
  assert.equal(parsed!.items.length, 2);
  assert.equal(parsed!.items[0]!.key, "sys:evalexpression");
  assert.equal(parsed!.items[1]!.name, "运行C#脚本");
});

test("parseStepRunnerSearchResult reads nested controlField on items", () => {
  const parsed = parseStepRunnerSearchResult(
    {
      ok: true,
      action: "step-runner-search",
      payload: {
        success: true,
        keyword: "移动",
        matchCount: 2,
        items: [
          {
            key: "sys:windowOperations",
            name: "窗口操作",
            controlField: { key: "type", value: "move_ex", name: "移动窗口(增强)" },
          },
          { key: "sys:csscript", name: "运行C#脚本" },
        ],
      },
    },
    { query: "移动", limit: 8 },
  );
  assert.ok(parsed);
  assert.equal(parsed!.controlFieldItemCount, 1);
  assert.deepEqual(parsed!.items[0]!.controlField, {
    key: "type",
    value: "move_ex",
    name: "移动窗口(增强)",
  });
  assert.equal(parsed!.items[1]!.controlField, undefined);
  assert.equal(
    formatStepRunnerSearchMetaLine(parsed!, {
      controlFieldItemCount: parsed!.controlFieldItemCount,
    }),
    "「移动」 · 2 个模块 · 1 含 controlField",
  );
});

test("parseStepRunnerSearchResult reads controlFields for OR hits", () => {
  const parsed = parseStepRunnerSearchResult(
    {
      ok: true,
      action: "step-runner-search",
      payload: {
        success: true,
        keyword: "复制文件|删除文件",
        matchCount: 1,
        items: [
          {
            key: "sys:fileOperation",
            name: "文件和目录",
            controlField: { key: "type", value: "copyInto", name: "复制到指定目录下" },
            controlFields: [
              { key: "type", value: "copyInto", name: "复制到指定目录下" },
              { key: "type", value: "deleteFile", name: "删除文件" },
            ],
          },
        ],
      },
    },
    { query: "复制文件|删除文件", limit: 8 },
  );
  assert.ok(parsed);
  assert.equal(parsed!.multiControlFieldCount, 1);
  assert.deepEqual(
    parsed!.items[0]!.controlFields?.map((c) => c.value),
    ["copyInto", "deleteFile"],
  );
});
