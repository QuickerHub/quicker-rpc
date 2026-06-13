import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildBoolExpressionFromVariable,
  isQkrpcTextTool,
  isWebTextTool,
  resolveTextToolDialogKind,
} from "@/lib/action-editor/steps/paramEditors/textToolWebSupport";

test("isWebTextTool marks implemented tools", () => {
  assert.equal(isWebTextTool("ColorPicker"), true);
  assert.equal(isWebTextTool("SelectActionId"), true);
  assert.equal(isWebTextTool("SelectActionName"), true);
  assert.equal(isWebTextTool("EditInCodeWindow"), true);
  assert.equal(isWebTextTool("SelectWindowTitle"), false);
});

test("isQkrpcTextTool marks desktop tools delegated to plugin", () => {
  assert.equal(isQkrpcTextTool("SelectWindowTitle"), true);
  assert.equal(isQkrpcTextTool("SelectLocationPoint"), true);
  assert.equal(isQkrpcTextTool("ColorPicker"), false);
});

test("resolveTextToolDialogKind maps dialog types", () => {
  assert.equal(resolveTextToolDialogKind("EditInCodeWindow"), "editInCode");
  assert.equal(resolveTextToolDialogKind("BoolExpressionHelper"), "boolExpression");
  assert.equal(resolveTextToolDialogKind("SelectKeyName"), "keyCapture");
  assert.equal(resolveTextToolDialogKind("SelectActionId"), "actionPicker");
  assert.equal(resolveTextToolDialogKind("SelectActionName"), "actionPicker");
  assert.equal(resolveTextToolDialogKind("SelectWindowHandle"), null);
});

test("buildBoolExpressionFromVariable wraps variable key", () => {
  assert.equal(buildBoolExpressionFromVariable({ id: "1", key: "flag", varType: 2 }), "$= {flag}");
});
