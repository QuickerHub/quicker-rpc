import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildEditNotFoundMessage,
  resolveUniqueEditNeedle,
  restoreFileEol,
  tryJsonDocumentEdit,
} from "./workspace-edit-match.ts";

test("resolveUniqueEditNeedle matches across CRLF vs LF", () => {
  const content = '{\r\n  "steps": [],\r\n  "variables": []\r\n}\r\n';
  const oldString = '{\n  "steps": [],\n  "variables": []\n}\n';
  const r = resolveUniqueEditNeedle(content, oldString);
  assert.equal(r.kind, "unique");
});

test("resolveUniqueEditNeedle matches literal backslash-n in oldString", () => {
  const content = '{\n  "steps": [],\n  "variables": []\n}\n';
  const oldString = '{\\n  "steps": [],\\n  "variables": []\\n}\\n';
  const r = resolveUniqueEditNeedle(content, oldString);
  assert.equal(r.kind, "unique");
});

test("resolveUniqueEditNeedle matches JSON re-indented oldString", () => {
  const content = '{\n  "steps": [],\n  "variables": []\n}\n';
  const oldString = '{"steps":[],"variables":[]}';
  const r = resolveUniqueEditNeedle(content, oldString);
  assert.equal(r.kind, "unique");
});

test("restoreFileEol writes CRLF when file had CRLF", () => {
  assert.equal(restoreFileEol("a\nb\n", "a\r\nb\r\n"), "a\r\nb\r\n");
});

test("tryJsonDocumentEdit full document replace", () => {
  const content = '{\n  "steps": [],\n  "variables": []\n}\n';
  const oldString = '{"steps":[],"variables":[]}';
  const newString = '{"steps":[{"stepRunnerKey":"sys:delay"}],"variables":[]}';
  const r = tryJsonDocumentEdit(content, oldString, newString);
  assert.ok(r?.ok);
  if (r?.ok) {
    assert.equal(JSON.parse(r.next).steps.length, 1);
    assert.equal(r.strategy, "json-full-replace");
  }
});

test("tryJsonDocumentEdit append steps when old anchor is empty steps array", () => {
  const content = JSON.stringify(
    {
      steps: [{ stepRunnerKey: "sys:delay", inputParams: {} }],
      variables: [],
    },
    null,
    2,
  );
  const oldString = JSON.stringify({ steps: [] });
  const newString = JSON.stringify({
    steps: [{ stepRunnerKey: "sys:evalexpression", inputParams: {} }],
  });
  const r = tryJsonDocumentEdit(content, oldString, newString);
  assert.ok(r?.ok);
  if (r?.ok) {
    const doc = JSON.parse(r.next) as { steps: unknown[] };
    assert.equal(doc.steps.length, 2);
    assert.equal(r.strategy, "json-append-steps");
  }
});

test("tryJsonDocumentEdit merge variables by key", () => {
  const content = JSON.stringify(
    {
      steps: [],
      variables: [{ key: "a", varType: "integer", defaultValue: "0" }],
    },
    null,
    2,
  );
  const oldString = JSON.stringify({ variables: [] });
  const newString = JSON.stringify({
    variables: [{ key: "b", varType: "integer", defaultValue: "1" }],
  });
  const r = tryJsonDocumentEdit(content, oldString, newString);
  assert.ok(r?.ok);
  if (r?.ok) {
    const doc = JSON.parse(r.next) as { variables: { key: string }[] };
    assert.equal(doc.variables.length, 2);
    assert.equal(r.strategy, "json-merge-variables");
  }
});

test("tryJsonDocumentEdit detects stale empty program template", () => {
  const content = JSON.stringify(
    {
      steps: [{ stepRunnerKey: "x" }],
      variables: [{ key: "n", varType: "integer" }],
    },
    null,
    2,
  );
  const oldString = '{"steps":[],"variables":[]}';
  const newString = '{"steps":[],"variables":[{"key":"z"}]}';
  const r = tryJsonDocumentEdit(content, oldString, newString);
  assert.ok(r && !r.ok);
  if (r && !r.ok) {
    assert.equal(r.reason, "stale-empty-template");
    assert.equal(r.steps, 1);
    assert.equal(r.variables, 1);
  }
});

test("buildEditNotFoundMessage includes file head", () => {
  const msg = buildEditNotFoundMessage("data.json", '{"steps":[1]}', '{"steps":[]}');
  assert.ok(msg.includes("File head"));
  assert.ok(msg.includes("oldString"));
});
