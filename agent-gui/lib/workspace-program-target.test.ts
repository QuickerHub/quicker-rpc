import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseWorkspaceProgramTarget } from "@/lib/workspace-program-target";

describe("parseWorkspaceProgramTarget", () => {
  it("parses action target", () => {
    const id = "846b4132-ad73-42e8-b2f9-c42fe718ae20";
    const result = parseWorkspaceProgramTarget({ target: "action", id });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.target.kind, "action");
    }
  });

  it("parses global subprogram", () => {
    const result = parseWorkspaceProgramTarget({
      target: "global_subprogram",
      id: "MySub",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.target.kind, "global_subprogram");
    }
  });

  it("requires subProgramId for embedded", () => {
    const actionId = "846b4132-ad73-42e8-b2f9-c42fe718ae20";
    const missing = parseWorkspaceProgramTarget({
      target: "embedded_subprogram",
      id: actionId,
    });
    assert.equal(missing.ok, false);

    const ok = parseWorkspaceProgramTarget({
      target: "embedded_subprogram",
      id: actionId,
      subProgramId: "sub-1",
    });
    assert.equal(ok.ok, true);
  });
});
