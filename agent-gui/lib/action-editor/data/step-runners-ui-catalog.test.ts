import assert from "node:assert/strict";
import { test } from "node:test";
import catalog from "./step-runners-ui-catalog.json";

const REQUIRED_UI_CATALOG_KEYS = ["sys:assign"];

test("step-runners-ui-catalog schemaCount matches schemas object keys", () => {
  const keys = Object.keys(catalog.schemas ?? {});
  assert.equal(
    catalog.schemaCount,
    keys.length,
    `schemaCount (${catalog.schemaCount}) must equal schemas keys (${keys.length})`,
  );
});

test("step-runners-ui-catalog schemas are non-empty objects", () => {
  const keys = Object.keys(catalog.schemas ?? {});
  for (const key of keys) {
    assert.ok(key.trim().length > 0, "schema key must be non-empty");
    const schema = catalog.schemas[key] as Record<string, unknown>;
    assert.ok(schema && typeof schema === "object", `${key} must have a schema object`);
    const schemaKey = typeof schema.key === "string" ? schema.key.trim() : "";
    if (schemaKey.length > 0) {
      assert.equal(schemaKey, key, `${key} schema.key must match map key when present`);
    }
  }
});

test("step-runners-ui-catalog includes required modules", () => {
  for (const key of REQUIRED_UI_CATALOG_KEYS) {
    assert.ok(catalog.schemas?.[key], `required module missing: ${key}`);
  }
});

test("step-runners-ui-catalog failedKeys is empty after export", () => {
  const failed = catalog.failedKeys ?? [];
  assert.deepEqual(
    failed,
    [],
    `failedKeys must be empty (got ${failed.join(", ")})`,
  );
});
