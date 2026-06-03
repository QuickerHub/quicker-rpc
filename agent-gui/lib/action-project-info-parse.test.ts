import assert from "node:assert/strict";
import test from "node:test";
import {
  isActionProjectInfoPath,
  parseActionProjectInfo,
  patchActionProjectInfoText,
  projectDirNameFromInfoPath,
} from "./action-project-info-parse.ts";
import { formatActionProjectInfoProto } from "./action-project-info.ts";
import { actionProjectInfoFromMetadataGet } from "./action-project-info.ts";

test("isActionProjectInfoPath", () => {
  assert.equal(isActionProjectInfoPath(".quicker/actions/foo/info.json"), true);
  assert.equal(isActionProjectInfoPath(".quicker/actions/foo/data.json"), false);
});

test("parseActionProjectInfo legacy PascalCase action", () => {
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
});

test("parseActionProjectInfo proto action", () => {
  const raw = formatActionProjectInfoProto(
    actionProjectInfoFromMetadataGet("fd936d22-c52f-45fd-9a53-4b073e520ffc", {
      actionId: "fd936d22-c52f-45fd-9a53-4b073e520ffc",
      editVersion: 1,
      compressed: {
        title: "半屏居中",
        description: "demo",
        icon: "fa:Light_Window",
      },
    }),
  );
  const result = parseActionProjectInfo(raw);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.title, "半屏居中");
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
});

const actionId = "18678f61-a75c-41b3-b0b4-1bfd9a1db084";

test("patchActionProjectInfoText proto action title", () => {
  const raw = formatActionProjectInfoProto(
    actionProjectInfoFromMetadataGet(actionId, {
      actionId,
      editVersion: 1,
      compressed: { title: "旧", description: "", icon: "", stepCount: 0, variableCount: 0, subProgramCount: 0, variableKeys: [], stepOutline: [] },
    }),
  );
  const patched = patchActionProjectInfoText(raw, "title", "新标题");
  assert.equal(patched.ok, true);
  if (!patched.ok) return;
  const parsed = parseActionProjectInfo(patched.content);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.data.title, "新标题");
});

test("projectDirNameFromInfoPath", () => {
  assert.equal(
    projectDirNameFromInfoPath(".quicker/actions/a2adb839-673d/info.json"),
    "a2adb839-673d",
  );
});
