import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadAuthoringDocFixtureRows } from "@/lib/action-authoring-docs-fixtures";
import {
  isBlockedReferenceKey,
  normalizeReferenceKey,
} from "@/lib/action-authoring-docs.shared";
import { loadSkillInstructions } from "@/lib/agent-skills/load";

describe("reference key normalization", () => {
  it("allows nested catalog ids", () => {
    assert.equal(
      normalizeReferenceKey("examples/chromecontrol"),
      "examples/chromecontrol",
    );
    assert.equal(isBlockedReferenceKey("examples/chromecontrol"), false);
    assert.equal(isBlockedReferenceKey("kc/chromecontrol"), false);
  });

  it("blocks path traversal", () => {
    assert.equal(isBlockedReferenceKey("../evil"), true);
    assert.equal(isBlockedReferenceKey("/etc/passwd"), true);
  });
});

describe("authoring doc fixtures include nested references", () => {
  it("loads examples/chromecontrol and kc/chromecontrol rows", async () => {
    const rows = await loadAuthoringDocFixtureRows();
    const examples = rows.find(
      (r) =>
        r.topic === "step-modules"
        && r.reference === "examples/chromecontrol",
    );
    const kc = rows.find(
      (r) =>
        r.topic === "step-modules" && r.reference === "kc/chromecontrol",
    );
    const authored = rows.find(
      (r) => r.topic === "step-modules" && r.reference === "chromecontrol",
    );
    assert.ok(examples);
    assert.ok(kc);
    assert.ok(authored);
    assert.match(examples!.markdown, /OpenUrl/);
  });
});

describe("on-demand skill load", () => {
  it("loads quicker-run SKILL.md body", async () => {
    const skill = await loadSkillInstructions("quicker-run");
    assert.ok(skill?.body);
    assert.match(skill!.body, /qkrpc_action/i);
  });
});
