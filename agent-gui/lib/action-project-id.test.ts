import assert from "node:assert/strict";
import test from "node:test";
import { resolveActionIdFromProject } from "./action-project-id.ts";

test("resolveActionIdFromProject prefers info id", () => {
  const id = "fd936d22-c52f-45fd-9a53-4b073e520ffc";
  assert.equal(
    resolveActionIdFromProject("other-folder", { id }),
    id,
  );
});

test("resolveActionIdFromProject falls back to GUID directory name", () => {
  const id = "b126a6fd-3947-4a75-8b41-cfd59edcbddb";
  assert.equal(resolveActionIdFromProject(id, {}), id);
  assert.equal(resolveActionIdFromProject(id, undefined), id);
});

test("resolveActionIdFromProject returns undefined for title folder without id", () => {
  assert.equal(
    resolveActionIdFromProject("剪贴板文本去重排序", {}),
    undefined,
  );
});
