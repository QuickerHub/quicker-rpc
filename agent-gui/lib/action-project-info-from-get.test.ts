import assert from "node:assert/strict";
import { test } from "node:test";
import {
  actionProjectInfoFromMetadataGet,
  formatActionProjectInfoProto,
  parseActionProjectInfoProto,
} from "@/lib/action-project-info";

const actionId = "18678f61-a75c-41b3-b0b4-1bfd9a1db084";

const metadataPayload = {
  success: true,
  actionId,
  editVersion: 1780439815389,
  returnMode: "metadata",
  compressed: {
    title: "剪贴板文本去重排序",
    description: "读取剪贴板",
    icon: "fa:Light_ClipboardList",
    stepCount: 0,
    variableCount: 0,
    subProgramCount: 0,
    variableKeys: [] as string[],
    stepOutline: [] as unknown[],
  },
};

test("actionProjectInfoFromMetadataGet builds proto without snapshot", () => {
  const info = actionProjectInfoFromMetadataGet(actionId, metadataPayload);
  assert.equal(info.id, actionId);
  assert.equal(info.title, "剪贴板文本去重排序");
  assert.equal("snapshot" in info, false);
  const raw = formatActionProjectInfoProto(info);
  assert.equal(raw.includes("stepCount"), false);
  assert.equal(raw.includes("snapshot"), false);
});

test("format and parse proto info.json round-trip", () => {
  const info = actionProjectInfoFromMetadataGet(actionId, metadataPayload);
  const raw = formatActionProjectInfoProto(info);
  const parsed = parseActionProjectInfoProto(raw);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.data.title, "剪贴板文本去重排序");
});
