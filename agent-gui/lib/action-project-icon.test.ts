import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ACTION_PROJECT_ICON,
  resolveActionProjectIconSpec,
} from "./action-project-icon.ts";

test("resolveActionProjectIconSpec uses default when empty", () => {
  assert.equal(resolveActionProjectIconSpec(""), DEFAULT_ACTION_PROJECT_ICON);
  assert.equal(resolveActionProjectIconSpec("  "), DEFAULT_ACTION_PROJECT_ICON);
  assert.equal(resolveActionProjectIconSpec(undefined), DEFAULT_ACTION_PROJECT_ICON);
});

test("resolveActionProjectIconSpec keeps stored spec", () => {
  assert.equal(
    resolveActionProjectIconSpec("fa:Light_Window"),
    "fa:Light_Window",
  );
});
