import test from "node:test";
import assert from "node:assert/strict";
import { parseSlashQueryBeforeCaret } from "@/lib/composer-slash-command";

test("parseSlashQueryBeforeCaret accepts bare slash", () => {
  assert.equal(parseSlashQueryBeforeCaret("/"), "");
  assert.equal(parseSlashQueryBeforeCaret("hello /"), "");
});

test("parseSlashQueryBeforeCaret parses command prefix", () => {
  assert.equal(parseSlashQueryBeforeCaret("/front"), "front");
  assert.equal(parseSlashQueryBeforeCaret("text /frontend-check"), "frontend-check");
});

test("parseSlashQueryBeforeCaret rejects non-slash context", () => {
  assert.equal(parseSlashQueryBeforeCaret("hello"), null);
  assert.equal(parseSlashQueryBeforeCaret("/"), "");
});
