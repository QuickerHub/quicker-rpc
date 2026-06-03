import assert from "node:assert/strict";
import test from "node:test";
import {
  formatActionMetadataMetaLine,
  parseActionMetadata,
  splitActionMetadataFields,
} from "./action-metadata.ts";

test("parses action metadata from tool input", () => {
  const meta = parseActionMetadata({
    title: "格式化JSON剪贴板",
    description: "读取剪贴板文本",
    icon: "fa:Light_ClipboardCheck",
  });
  assert.ok(meta);
  assert.equal(meta!.title, "格式化JSON剪贴板");
  assert.equal(meta!.icon, "fa:Light_ClipboardCheck");
});

test("requires at least one display field besides id", () => {
  assert.equal(parseActionMetadata({ id: "a2adb839-673d-44c5-a725-854700cedb50" }), null);
});

test("splits extra tool fields", () => {
  const { meta, rest } = splitActionMetadataFields({
    id: "a2adb839-673d-44c5-a725-854700cedb50",
    title: "Test",
    expectedEditVersion: 3,
  });
  assert.ok(meta);
  assert.equal(rest.expectedEditVersion, 3);
  assert.equal(rest.title, undefined);
});

test("formatActionMetadataMetaLine", () => {
  assert.equal(
    formatActionMetadataMetaLine({ title: "Hello" }),
    "Hello",
  );
});
