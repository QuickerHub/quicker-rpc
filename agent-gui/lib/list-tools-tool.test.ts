import assert from "node:assert/strict";
import { test } from "node:test";
import { executeListToolsTool } from "./list-tools-tool-execute";

test("executeListToolsTool routing returns markdown table", async () => {
  const result = await executeListToolsTool({ action: "routing" });
  assert.equal(result.ok, true);
  const data = result.data as Record<string, unknown>;
  assert.ok(String(data.routingTable).includes("User intent"));
});

test("executeListToolsTool bundles lists categorized packs", async () => {
  const result = await executeListToolsTool({ action: "bundles" });
  assert.equal(result.ok, true);
  const data = result.data as { bundles?: Array<{ id: string }> };
  assert.ok(data.bundles?.some((bundle) => bundle.id === "action_authoring"));
});

test("executeListToolsTool bundle requires bundleId", async () => {
  const result = await executeListToolsTool({ action: "bundle" });
  assert.equal(result.ok, false);
});

test("executeListToolsTool bundle rejects unknown pack", async () => {
  const result = await executeListToolsTool({
    action: "bundle",
    bundleId: "not_a_bundle" as "core",
  });
  assert.equal(result.ok, false);
});
test("executeListToolsTool index lists registry tools", async () => {
  const result = await executeListToolsTool({ action: "index" });
  assert.equal(result.ok, true);
  const data = result.data as { toolIds?: string[] };
  assert.ok(data.toolIds?.includes("docs"));
  assert.ok(data.toolIds?.includes("list_tools"));
});
