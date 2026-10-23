import assert from "node:assert/strict";
import { test } from "node:test";
import { readDesignerCatalogContext, withDesignerCatalogContext, designerCatalogTargetKey, DesignerCatalogError, designerCatalogFailure, type DesignerCatalogContext } from "./designerCatalogContext";
import type { ActionProjectBinding } from "../../action-project-binding";

const record: ActionProjectBinding = { schemaVersion: 1, kind: "action", actionId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", hostBinding: {
  hostInstanceId: "fixture", hostSessionId: "a".repeat(32), endpoint: `QuickerRpc_User_${"B".repeat(24)}_${"a".repeat(32)}`,
  protocolVersion: 1, schemaVersion: 1, hostKind: "v1", quickerVersion: "fixture", capabilities: { ActionRead: true },
} };
const context: DesignerCatalogContext = { cwd: "D:/fixture", projectDirectory: ".quicker/actions/named", expectedProjectBinding: record };

test("catalog envelope preserves legacy, loading, unbound and complete target as distinct states", () => {
  assert.equal(readDesignerCatalogContext({ key: "sys:test" }), undefined);
  assert.equal(readDesignerCatalogContext(withDesignerCatalogContext({}, null)), null);
  assert.equal(readDesignerCatalogContext(withDesignerCatalogContext({}, { ...context, expectedProjectBinding: null }))?.expectedProjectBinding, null);
  assert.deepEqual(readDesignerCatalogContext(withDesignerCatalogContext({ key: "sys:test" }, context)), context);
  assert.equal(Object.hasOwn(withDesignerCatalogContext({}, undefined), "catalogContext"), false);
  for (const invalid of [undefined, {}, { projectDirectory: "" }, { projectDirectory: "x", expectedProjectBinding: undefined }]) {
    assert.throws(() => readDesignerCatalogContext({ catalogContext: invalid }));
  }
});

test("catalog keys isolate cwd, exact document target, session, capabilities and future host extensions", () => {
  const key = designerCatalogTargetKey(context);
  const reordered = { ...context, expectedProjectBinding: { ...record, actionId: record.actionId.toUpperCase(), hostBinding: { ...record.hostBinding } } };
  assert.equal(designerCatalogTargetKey(reordered), key);
  assert.equal(designerCatalogTargetKey({ ...context, cwd: "D:\\fixture\\", projectDirectory: ".quicker\\actions\\named\\" }), key);
  for (const other of [undefined, null, { ...context, expectedProjectBinding: null }, { ...context, cwd: "D:/other" },
    { ...context, projectDirectory: ".quicker/actions/other" },
    { ...context, expectedProjectBinding: { ...record, hostBinding: { ...record.hostBinding, capabilities: { ActionRead: false } } } },
    { ...context, expectedProjectBinding: { ...record, hostBinding: { ...record.hostBinding, future: { x: 1 } } } }]) {
    assert.notEqual(designerCatalogTargetKey(other), key);
  }
});

test("catalog errors keep machine-readable identity codes without retry advice", () => {
  const failure = designerCatalogFailure(new DesignerCatalogError("PROJECT_IDENTITY_LOADING", "Wait for this document's target."));
  assert.deepEqual(failure, { ok: false, code: "PROJECT_IDENTITY_LOADING", error: "Wait for this document's target.", retryable: false });
});
