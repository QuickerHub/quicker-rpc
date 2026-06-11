import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEvaluatePageCode,
  formatEvaluateOutput,
  parseEvaluateResult,
} from "./evaluate-script.mjs";

async function runInPage(script) {
  const built = buildEvaluatePageCode(script);
  assert.equal(built.ok, true, built.ok ? "" : built.error);
  // eslint-disable-next-line no-new-func -- test harness mimics page.evaluate
  return new Function(`return ${built.code}`)();
}

describe("evaluate-script", () => {
  it("rejects empty script", () => {
    const built = buildEvaluatePageCode("  ");
    assert.equal(built.ok, false);
    assert.match(built.error, /required/i);
  });

  it("rejects syntax errors", () => {
    const built = buildEvaluatePageCode("const x = ;");
    assert.equal(built.ok, false);
    assert.match(built.error, /syntax error/i);
  });

  it("evaluates expression with trailing semicolon", async () => {
    const raw = await runInPage("1 + 2;");
    const parsed = parseEvaluateResult(raw);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.value, 3);
    assert.equal(parsed.undefinedResult, false);
  });

  it("evaluates object literal expression", async () => {
    const raw = await runInPage("({ title: 'hello', count: 2 })");
    const parsed = parseEvaluateResult(raw);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.value, { title: "hello", count: 2 });
  });

  it("evaluates multi-line body with return", async () => {
    const raw = await runInPage(`
      const items = [1, 2, 3];
      return { count: items.length, sum: items.reduce((a, b) => a + b, 0) };
    `);
    const parsed = parseEvaluateResult(raw);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.value, { count: 3, sum: 6 });
  });

  it("serializes circular references safely", async () => {
    const raw = await runInPage(`
      const obj = { name: "x" };
      obj.self = obj;
      return obj;
    `);
    const parsed = parseEvaluateResult(raw);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.value.name, "x");
    assert.equal(parsed.value.self, "[circular]");
  });

  it("marks undefined results with note metadata", async () => {
    const raw = await runInPage("void 0");
    const parsed = parseEvaluateResult(raw);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.value, null);
    assert.equal(parsed.undefinedResult, true);
  });

  it("surfaces thrown errors", async () => {
    const raw = await runInPage("throw new Error('boom')");
    const parsed = parseEvaluateResult(raw);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /boom/);
  });
});

describe("formatEvaluateOutput", () => {
  it("keeps objects structured in value without json duplicate", () => {
    const out = formatEvaluateOutput({
      ok: true,
      value: { count: 2, items: ["a", "b"] },
      undefinedResult: false,
    });
    assert.deepEqual(out.value, { count: 2, items: ["a", "b"] });
    assert.equal("json" in out, false);
    assert.equal("charCount" in out, false);
  });

  it("stringifies non-object scalars", () => {
    const num = formatEvaluateOutput({
      ok: true,
      value: 42,
      undefinedResult: false,
    });
    assert.equal(num.value, "42");

    const bool = formatEvaluateOutput({
      ok: true,
      value: true,
      undefinedResult: false,
    });
    assert.equal(bool.value, "true");
  });

  it("returns null with note for undefined script results", () => {
    const out = formatEvaluateOutput({
      ok: true,
      value: null,
      undefinedResult: true,
    });
    assert.equal(out.value, null);
    assert.match(String(out.note), /undefined/i);
  });
});
