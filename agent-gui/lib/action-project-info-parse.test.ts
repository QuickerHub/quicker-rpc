import assert from "node:assert/strict";
import test from "node:test";
import {
  formatExportedUtc,
  isActionProjectInfoPath,
  parseActionProjectInfo,
  patchActionProjectInfoText,
  projectDirNameFromInfoPath,
} from "./action-project-info-parse.ts";

test("isActionProjectInfoPath", () => {
  assert.equal(isActionProjectInfoPath(".quicker/actions/foo/info.json"), true);
  assert.equal(isActionProjectInfoPath(".quicker/actions/foo/data.json"), false);
});

test("parseActionProjectInfo action", () => {
  const result = parseActionProjectInfo(`{
    "Id": "fd936d22-c52f-45fd-9a53-4b073e520ffc",
    "Title": "半屏居中",
    "Description": "demo",
    "Icon": "fa:Light_Window",
    "EditVersion": 1780286785952,
    "ExportedUtc": "2026-06-01T12:06:58.6636956Z"
  }`);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.kind, "action");
  assert.equal(result.data.id, "fd936d22-c52f-45fd-9a53-4b073e520ffc");
  assert.equal(result.data.title, "半屏居中");
  assert.equal(result.data.icon, "fa:Light_Window");
  assert.equal(result.data.editVersion, 1780286785952);
});

test("parseActionProjectInfo subprogram", () => {
  const result = parseActionProjectInfo(`{
    "Id": "abc",
    "Name": "MySub",
    "CallIdentifier": "%%{guid}",
    "EditVersion": 1
  }`);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.kind, "subprogram");
  assert.equal(result.data.name, "MySub");
  assert.equal(result.data.callIdentifier, "%%{guid}");
});

test("parseActionProjectInfo invalid json", () => {
  const result = parseActionProjectInfo("{");
  assert.equal(result.ok, false);
});

test("projectDirNameFromInfoPath", () => {
  assert.equal(
    projectDirNameFromInfoPath(".quicker/actions/a2adb839-673d/info.json"),
    "a2adb839-673d",
  );
});

test("formatExportedUtc returns input when invalid", () => {
  assert.equal(formatExportedUtc("not-a-date"), "not-a-date");
});

test("patchActionProjectInfoText preserves PascalCase keys", () => {
  const original = `{
  "Id": "abc",
  "Title": "旧标题",
  "Description": "旧描述"
}
`;
  const titlePatch = patchActionProjectInfoText(original, "title", "新标题");
  assert.equal(titlePatch.ok, true);
  if (!titlePatch.ok) return;
  const parsed = parseActionProjectInfo(titlePatch.content);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.data.title, "新标题");

  const descPatch = patchActionProjectInfoText(titlePatch.content, "description", "新描述");
  assert.equal(descPatch.ok, true);
  if (!descPatch.ok) return;
  assert.ok(descPatch.content.includes('"Description": "新描述"'));
});
