import assert from "node:assert/strict";
import { test } from "node:test";
import {
  coerceWireInputParam,
  compactWireInputParam,
  expandWireInputParams,
  parseTypedWireString,
  parseWireParamKey,
} from "@/lib/input-param-wire";
import { normalizeProgramWireForDisk } from "@/lib/action-editor/wire/normalizeProgramWireForDisk";

test("parseWireParamKey splits suffix binds", () => {
  assert.deepEqual(parseWireParamKey("expression.file"), {
    baseKey: "expression",
    kind: "file",
  });
  assert.deepEqual(parseWireParamKey("condition.var"), {
    baseKey: "condition",
    kind: "var",
  });
  assert.deepEqual(parseWireParamKey("title"), {
    baseKey: "title",
    kind: "value",
  });
});

test("expandWireInputParams compacts disk wire to canonical", () => {
  assert.deepEqual(
    expandWireInputParams({
      expression: "1+1",
      "code.file": "files/main.eval.cs",
      "outputVar.var": "lineCount",
    }),
    {
      expression: { value: "1+1" },
      code: { file: "files/main.eval.cs" },
      outputVar: { varKey: "lineCount" },
    },
  );
});

test("plain key string is always literal value", () => {
  assert.deepEqual(coerceWireInputParam("files/readme.txt"), {
    value: "files/readme.txt",
  });
});

test("compactWireInputParam emits disk wire keys", () => {
  assert.deepEqual(
    compactWireInputParam("code", { file: "files/a.cs" }),
    { "code.file": "files/a.cs" },
  );
  assert.deepEqual(
    compactWireInputParam("condition", { varKey: "x" }),
    { "condition.var": "x" },
  );
  assert.deepEqual(
    compactWireInputParam("title", { value: "Hello" }),
    { title: "Hello" },
  );
});

test("expandWireInputParams accepts legacy object binds", () => {
  assert.deepEqual(
    expandWireInputParams({
      formDef: { file: "files/form1.form.json" },
      title: { value: "Hello" },
    }),
    {
      formDef: { file: "files/form1.form.json" },
      title: { value: "Hello" },
    },
  );
});

test("legacy @prefix strings still expand on read (compat)", () => {
  assert.deepEqual(parseTypedWireString("@var:url"), { varKey: "url" });
  assert.deepEqual(parseTypedWireString("@file:files/x.txt"), { file: "files/x.txt" });
  assert.deepEqual(parseTypedWireString("@value:files/x"), { value: "files/x" });
});

test("expandWireInputParams preserves var: subprogram param keys", () => {
  assert.deepEqual(parseWireParamKey("var:value.var"), {
    baseKey: "var:value",
    kind: "var",
  });
  assert.deepEqual(
    expandWireInputParams({
      "var:value.var": "seed",
      "var:result": "answer",
      "var:path": "@var:workDir",
    }),
    {
      "var:value": { varKey: "seed" },
      "var:result": { value: "answer" },
      "var:path": { varKey: "workDir" },
    },
  );
  assert.deepEqual(
    compactWireInputParam("var:value", { varKey: "seed" }),
    { "var:value.var": "seed" },
  );
});

test("literal typed prefixes survive compact/expand and repeated disk normalization", () => {
  const literals = ["@var:target", "@file:files/a.txt", "@value:name", "@VALUE:", "@VaR:  target  ", "@FiLe: files\\a.txt", "@value:@var:target"];
  for (const value of literals) {
    const compact = compactWireInputParam("subProgram", { value });
    assert.deepEqual(compact, { subProgram: `@value:${value}` });
    assert.deepEqual(expandWireInputParams(compact), { subProgram: { value } });
    const content = JSON.stringify({ steps: [{ stepRunnerKey: "sys:subprogram", inputParams: { subProgram: { value } } }], variables: [] });
    const once = normalizeProgramWireForDisk(content);
    const twice = normalizeProgramWireForDisk(once);
    assert.equal(twice, once);
    assert.deepEqual(expandWireInputParams(JSON.parse(twice).steps[0].inputParams), { subProgram: { value } });
  }
});

test("empty binding prefixes remain literal and dynamic bindings keep their original precedence", () => {
  for (const value of ["@var:", "@var:  ", "@file:", "@FILE:  ", "$=name", "$$name", "@json:{}", "@v:name"]) {
    assert.deepEqual(compactWireInputParam("name", { value }), { name: value });
    assert.deepEqual(expandWireInputParams({ name: value }), { name: { value } });
  }
  assert.deepEqual(compactWireInputParam("name", { value: "@value:literal", varKey: " actual " }), { "name.var": "actual" });
  assert.deepEqual(compactWireInputParam("name", { value: "@var:literal", varKey: "actual", file: " files\\a.txt " }), { "name.file": "files/a.txt" });
});
