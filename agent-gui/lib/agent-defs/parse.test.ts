import test from "node:test";
import assert from "node:assert/strict";
import { parseInheritList } from "@/lib/agent-defs/frontmatter";
import { parseSubagentDef } from "@/lib/agent-defs/parse";

test("parseInheritList accepts comma and space separated tokens", () => {
  assert.deepEqual(parseInheritList("skills workspace"), ["skills", "workspace"]);
  assert.deepEqual(parseInheritList("skills, workspace"), ["skills", "workspace"]);
  assert.deepEqual(parseInheritList("all"), ["all"]);
  assert.deepEqual(parseInheritList(""), []);
  assert.deepEqual(parseInheritList("skills unknown"), ["skills"]);
});

test("parseSubagentDef reads inherit frontmatter", () => {
  const record = parseSubagentDef(
    "/tmp/agents/authoring-verify.md",
    `---
name: authoring-verify
description: Verify patch
tools: workspace_program docs
inherit: skills workspace
---
Body
`,
    "bundled",
  );
  assert.ok(record);
  assert.deepEqual(record.inherit, ["skills", "workspace"]);
});
