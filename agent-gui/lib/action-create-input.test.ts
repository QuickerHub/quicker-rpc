import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveActionCreateManageInput } from "@/lib/action-create-input";

test("resolveActionCreateManageInput maps info fields", () => {
  const parsed = resolveActionCreateManageInput({
    info: {
      title: "Line count",
      description: "Count URL lines",
      icon: "fa:Light_List",
    },
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.action, "create");
  assert.equal(parsed.data.title, "Line count");
  assert.equal(parsed.data.description, "Count URL lines");
  assert.equal(parsed.data.icon, "fa:Light_List");
});

test("resolveActionCreateManageInput requires info.title", () => {
  const parsed = resolveActionCreateManageInput({
    info: { title: "  " },
  });
  assert.equal(parsed.success, false);
});
