import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildActionPickerInsertValue,
  formatActionGuidD,
  formatActionPickerShortId,
} from "@/lib/action-editor/steps/paramEditors/textToolActionPicker";
import type { ActionMentionItem } from "@/lib/action-mention-items";

const sampleAction: ActionMentionItem = {
  kind: "action",
  id: "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
  title: "示例动作",
};

test("formatActionGuidD normalizes GUID to lowercase D format", () => {
  assert.equal(
    formatActionGuidD("A1B2C3D4-E5F6-7890-ABCD-EF1234567890"),
    "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  );
});

test("buildActionPickerInsertValue matches desktop SelectActionTool", () => {
  assert.equal(
    buildActionPickerInsertValue(sampleAction, "id"),
    "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  );
  assert.equal(buildActionPickerInsertValue(sampleAction, "name"), "示例动作");
});

test("buildActionPickerInsertValue falls back to id when title missing", () => {
  const row: ActionMentionItem = {
    kind: "action",
    id: "11111111-2222-3333-4444-555555555555",
    title: "(无标题)",
  };
  assert.equal(buildActionPickerInsertValue(row, "name"), "11111111-2222-3333-4444-555555555555");
});

test("formatActionPickerShortId truncates long GUID", () => {
  assert.equal(formatActionPickerShortId("11111111-2222-3333-4444-555555555555"), "11111111…");
});
