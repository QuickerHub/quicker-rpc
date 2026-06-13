import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { resolveDesignerWindowContext } from "@/lib/designer-embed-layout";

describe("designer-embed-layout", () => {
  test("resolveDesignerWindowContext matches entity and subprogram flag", () => {
    const snapshot = {
      ok: true,
      designers: [
        {
          entityId: "AAA",
          isSubProgram: false,
          title: "My Action",
          selectedSteps: [{ index: 2, note: "HTTP" }],
        },
        {
          entityId: "BBB",
          isSubProgram: true,
          title: "Sub",
        },
      ],
    };

    const match = resolveDesignerWindowContext(snapshot, {
      enabled: true,
      scoped: true,
      debugMode: false,
      entityId: "aaa",
      isSubProgram: false,
    });

    assert.equal(match?.title, "My Action");
    assert.equal(match?.selectedSteps?.[0]?.index, 2);
  });

  test("resolveDesignerWindowContext falls back to active designer", () => {
    const snapshot = {
      ok: true,
      designers: [
        { entityId: "other", isActive: false, title: "Other" },
        { entityId: "active", isActive: true, title: "Active" },
      ],
    };

    const match = resolveDesignerWindowContext(snapshot, {
      enabled: true,
      scoped: true,
      debugMode: false,
      entityId: "missing",
      isSubProgram: false,
    });

    assert.equal(match?.title, "Active");
  });
});
