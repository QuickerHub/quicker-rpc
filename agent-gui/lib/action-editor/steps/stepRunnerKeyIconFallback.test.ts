import { describe, expect, it } from "vitest";
import { resolveStepIconSpec } from "./stepRunnerKeyIconFallback";

describe("resolveStepIconSpec", () => {
  it("returns catalog fa icon when present", () => {
    expect(resolveStepIconSpec("fa:Regular_ProjectDiagram:#6aaded", "sys:simpleIf")).toBe(
      "fa:Regular_ProjectDiagram:#6aaded",
    );
  });

  it("returns empty when catalog icon missing", () => {
    expect(resolveStepIconSpec("", "sys:simpleIf")).toBe("");
    expect(resolveStepIconSpec(undefined, "sys:form")).toBe("");
  });
});
