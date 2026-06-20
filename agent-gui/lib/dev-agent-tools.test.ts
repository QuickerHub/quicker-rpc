import assert from "node:assert/strict";
import { test } from "node:test";
import { DEV_FRONTEND_CHECK_TOOL } from "./dev-frontend-check-tool-constants";
import {
  filterDevOnlyToolIds,
  isDevOnlyToolId,
} from "./dev-agent-tools";

test("isDevOnlyToolId marks dev_frontend_check", () => {
  assert.equal(isDevOnlyToolId(DEV_FRONTEND_CHECK_TOOL), true);
  assert.equal(isDevOnlyToolId("Shell"), false);
});

test("filterDevOnlyToolIds strips dev tools when includeDev=false", () => {
  const filtered = filterDevOnlyToolIds(
    ["Shell", DEV_FRONTEND_CHECK_TOOL, "docs"],
    { includeDev: false },
  );
  assert.deepEqual(filtered, ["Shell", "docs"]);
});
