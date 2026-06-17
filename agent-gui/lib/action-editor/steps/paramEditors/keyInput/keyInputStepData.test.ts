import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildKeyInputWire,
  formatKeyInputKeysName,
  isKeyInputWireJson,
  parseKeyInputStepData,
  serializeKeyInputStepData,
  KEY_INPUT_WIRE_EXAMPLES,
} from "@/lib/action-editor/steps/paramEditors/keyInput/keyInputStepData";

test("parse and serialize KeyInputStepData round-trip", () => {
  const raw = '{"CtrlKeys":[162],"Keys":[68]}';
  const data = parseKeyInputStepData(raw);
  assert.deepEqual(data, { ctrlKeys: [162], keys: [68] });
  assert.equal(serializeKeyInputStepData(data), raw);
});

test("formatKeyInputKeysName matches Quicker style", () => {
  const data = parseKeyInputStepData('{"CtrlKeys":[162],"Keys":[68]}');
  assert.equal(formatKeyInputKeysName(data), "LeftCtrl+ [ D ]");
});

test("empty keys shows placeholder", () => {
  assert.equal(formatKeyInputKeysName({ ctrlKeys: [], keys: [] }), "<未设置>");
});

test("isKeyInputWireJson rejects sendKeys syntax", () => {
  assert.equal(isKeyInputWireJson("{Ctrl}c"), false);
  assert.equal(isKeyInputWireJson('{"CtrlKeys":[162],"Keys":[67]}'), true);
});

test("buildKeyInputWire for agent authoring", () => {
  const wire = buildKeyInputWire({ ctrl: true, keys: ["C"] });
  assert.equal(wire, '{"CtrlKeys":[17],"Keys":[67]}');
  assert.equal(
    formatKeyInputKeysName(parseKeyInputStepData(wire)),
    "Ctrl+ [ C ]",
  );
});

test("KEY_INPUT_WIRE_EXAMPLES are valid JSON", () => {
  for (const row of KEY_INPUT_WIRE_EXAMPLES) {
    assert.equal(isKeyInputWireJson(row.wire), true, row.label);
  }
});
