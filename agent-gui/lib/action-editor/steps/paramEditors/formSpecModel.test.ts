import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  isFormSpecFilePath,
  parseFormSpecText,
  prepareFormSpecFileContentForWrite,
  serializeFormSpec,
  suggestFormSpecFileName,
  summarizeFormSpec,
} from "./formSpecModel.ts";

test("parseFormSpecText reads qkrpc.form.v1 fixture", () => {
  const fixture = join(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "..",
    "..",
    ".quicker",
    "actions",
    "846b4132-ad73-42e8-b2f9-c42fe718ae20",
    "files",
    "form1.form.json",
  );
  let raw: string;
  try {
    raw = readFileSync(fixture, "utf8");
  } catch {
    return;
  }

  const parsed = parseFormSpecText(raw);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.format, "v1");
  assert.ok(parsed.spec.fields.length >= 2);
  const summary = summarizeFormSpec(parsed.spec);
  assert.match(summary.title, /OCR/);
});

test("parseFormSpecText reads visibleWhen on fields", () => {
  const parsed = parseFormSpecText(
    JSON.stringify({
      $schema: "qkrpc.form.v1",
      mode: "variables",
      title: "Cond",
      fields: [
        { key: "kind", label: "Kind", type: "text" },
        {
          key: "custom",
          label: "Custom",
          type: "text",
          visibleWhen: { field: "kind", eq: "custom" },
        },
      ],
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.spec.fields[1]?.visibleWhen, {
    field: "kind",
    eq: "custom",
  });
  const serialized = serializeFormSpec(parsed.spec);
  const again = parseFormSpecText(serialized);
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.deepEqual(again.spec.fields[1]?.visibleWhen, {
    field: "kind",
    eq: "custom",
  });
});

test("serializeFormSpec roundtrip keeps schema and fields", () => {
  const parsed = parseFormSpecText(
    JSON.stringify(
      {
        $schema: "qkrpc.form.v1",
        mode: "variables",
        title: "Demo",
        fields: [
          {
            key: "name",
            label: "Name",
            type: "text",
            required: true,
          },
          {
            key: "mode",
            label: "Mode",
            type: "select",
            options: [{ value: "a", label: "A" }],
          },
        ],
      },
      null,
      2,
    ),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;

  const again = parseFormSpecText(serializeFormSpec(parsed.spec));
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.spec.title, "Demo");
  assert.equal(again.spec.fields.length, 2);
  assert.equal(again.spec.fields[1]?.type, "select");
});

test("suggestFormSpecFileName skips used names", () => {
  assert.equal(
    suggestFormSpecFileName(["files/form1.form.json", "files/form2.form.json"]),
    "files/form3.form.json",
  );
});

test("isFormSpecFilePath matches *.form.json basename", () => {
  assert.equal(isFormSpecFilePath("files/task.form.json"), true);
  assert.equal(isFormSpecFilePath("files/readme.json"), false);
});

test("prepareFormSpecFileContentForWrite maps option name to label", () => {
  const raw = JSON.stringify(
    {
      $schema: "qkrpc.form.v1",
      mode: "variables",
      title: "T",
      fields: [
        {
          key: "p",
          label: "P",
          type: "select",
          options: [{ value: "高", name: "高" }],
        },
      ],
    },
    null,
    0,
  );
  const prepared = prepareFormSpecFileContentForWrite(raw);
  assert.equal(prepared.ok, true);
  if (!prepared.ok) return;
  assert.match(prepared.content, /"label": "高"/);
  assert.doesNotMatch(prepared.content, /"name":/);
  assert.equal(prepared.reformatted, true);
});

test("prepareFormSpecFileContentForWrite rejects invalid JSON", () => {
  const broken = `{
  "fields": [
    { "key": "p", "label": "P", "type": "select", "options": [
      { "value": "高", "name": "高" }
      { "value": "低", "name": "低" }
    ]}
  ]
}`;
  const prepared = prepareFormSpecFileContentForWrite(broken);
  assert.equal(prepared.ok, false);
});
