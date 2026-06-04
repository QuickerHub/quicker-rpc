import assert from "node:assert/strict";
import { test } from "node:test";

test("external file param uses file path only when value and varKey are empty", () => {
  const param = { varKey: "", value: "", file: "files/main.cs" };
  const inlineValue = param.value ?? "";
  const filePath = (param.file ?? "").trim() || null;
  const isExternalFile = Boolean(filePath && !inlineValue && !(param.varKey ?? "").trim());
  assert.equal(isExternalFile, true);
});

test("inline value takes precedence over file ref for display mode", () => {
  const param = { varKey: "", value: "inline", file: "files/main.cs" };
  const inlineValue = param.value ?? "";
  const filePath = (param.file ?? "").trim() || null;
  const isExternalFile = Boolean(filePath && !inlineValue && !(param.varKey ?? "").trim());
  assert.equal(isExternalFile, false);
});
