import test from "node:test";
import assert from "node:assert/strict";
import { parseInheritList } from "@/lib/agent-defs/frontmatter";
import { parseCommandDef, parseSubagentDef } from "@/lib/agent-defs/parse";

test("omitted capability lists inherit and explicit empty lists deny all", () => {
  const raw = (field = "") => `---\ndescription: example\n${field}---\nBody`;
  assert.equal(parseCommandDef("demo.md", raw(), "workspace")?.allowedTools, undefined);
  assert.deepEqual(parseCommandDef("demo.md", raw('allowed-tools: ""\n'), "workspace")?.allowedTools, []);
  assert.equal(parseSubagentDef("demo.md", raw(), "workspace")?.tools, undefined);
  assert.deepEqual(parseSubagentDef("demo.md", raw('tools: ""\n'), "workspace")?.tools, []);
});

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
