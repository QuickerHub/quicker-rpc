import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  parseFormSpecText,
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
