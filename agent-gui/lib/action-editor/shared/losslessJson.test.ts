import assert from "node:assert/strict";
import { test } from "node:test";
import { isLosslessJsonNumber, losslessJsonNumberText, parseLosslessJson, stringifyLosslessJson } from "./losslessJson";

test("numbers survive parse, structured clone and serialization with exact source lexemes", () => {
  const lexemes = ["9007199254740993", "9223372036854775807", "-9223372036854775808", "0.123456789012345678901", "1.230000000000000000001e+123", "1e999", "1e-999", "-0", "1e+03", "1.0"];
  const text = `[${lexemes.join(",")}]`;
  const parsed = parseLosslessJson(text) as unknown[];
  assert.ok(parsed.every(isLosslessJsonNumber));
  assert.deepEqual(parsed.map((value) => losslessJsonNumberText(value as Map<string, string>)), lexemes);
  assert.equal(stringifyLosslessJson(structuredClone(parsed)), text);
});

test("ordinary editable numbers remain numbers; JSON strings and marker-looking objects cannot collide", () => {
  const text = '{"count":2,"delay":12.5,"label":"9007199254740993","future":{"quicker.json.number":"9007199254740993"},"escaped":"\\\"1e999\\\""}';
  const parsed = parseLosslessJson(text) as Record<string, unknown>;
  assert.equal(parsed.count, 2);
  assert.equal(parsed.delay, 12.5);
  assert.equal(isLosslessJsonNumber(parsed.future), false);
  assert.deepEqual(JSON.parse(stringifyLosslessJson(parsed)), JSON.parse(text));
  assert.equal(stringifyLosslessJson(parsed, 2), JSON.stringify(JSON.parse(text), null, 2));
});

test("parser validates JSON and treats __proto__ as data, including duplicate-key last-wins semantics", () => {
  assert.throws(() => parseLosslessJson('{"number":01}'), SyntaxError);
  assert.throws(() => parseLosslessJson('{"number":1e}'), SyntaxError);
  const parsed = parseLosslessJson('{"__proto__":{"n":9007199254740993},"x":1,"x":2}') as Record<string, unknown>;
  assert.equal(Object.getPrototypeOf(parsed), Object.prototype);
  assert.equal(parsed.x, 2);
  assert.match(stringifyLosslessJson(parsed), /"__proto__":\{"n":9007199254740993\}/);
});

test("serializer matches JSON-shaped omission/array/indentation semantics and rejects cycles", () => {
  const value = { unset: undefined, list: [undefined, null, 2], nested: { bool: false }, date: new Date("2026-01-01T00:00:00.000Z") };
  assert.equal(stringifyLosslessJson(value, 2), JSON.stringify(value, null, 2));
  const circular: Record<string, unknown> = {}; circular.self = circular;
  assert.throws(() => stringifyLosslessJson(circular), /circular/);
});
