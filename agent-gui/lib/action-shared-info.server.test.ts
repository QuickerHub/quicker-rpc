import assert from "node:assert/strict";
import test from "node:test";

test("invokeActionSharedInfoGet rejects empty id", async () => {
  const { invokeActionSharedInfoGet } = await import("./action-shared-info.server.ts");
  const result = await invokeActionSharedInfoGet("  ");
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /id is required/i);
});

test("invokeActionSharedInfoSet rejects empty html", async () => {
  const { invokeActionSharedInfoSet } = await import("./action-shared-info.server.ts");
  const result = await invokeActionSharedInfoSet(
    "86c72b86-0169-4970-e9de-08dec5dab067",
    "   ",
  );
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /html is required/i);
});
