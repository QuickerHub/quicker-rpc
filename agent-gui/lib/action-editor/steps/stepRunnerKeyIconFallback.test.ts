import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { resolveStepIconSpec } from "./stepRunnerKeyIconFallback";

describe("resolveStepIconSpec", () => {
  test("returns catalog fa icon when present", () => {
    assert.equal(
      resolveStepIconSpec("fa:Regular_ProjectDiagram:#6aaded", "sys:simpleIf"),
      "fa:Regular_ProjectDiagram:#6aaded",
    );
  });

  test("returns empty when catalog icon missing", () => {
    assert.equal(resolveStepIconSpec("", "sys:simpleIf"), "");
    assert.equal(resolveStepIconSpec(undefined, "sys:form"), "");
  });
});
