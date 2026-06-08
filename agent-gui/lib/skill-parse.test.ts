import test from "node:test";
import assert from "node:assert/strict";
import { parseSkillMd } from "@/lib/skill-parse";

test("parseSkillMd extracts agentskills.io frontmatter", () => {
  const content = `---
name: quicker-authoring
description: Routes Quicker headless action editing.
allowed-tools: docs
compatibility: "QuickerAgent"
metadata:
  layer: workflow
---

# Body

Route table here.
`;
  const parsed = parseSkillMd(content);
  assert.equal(parsed.name, "quicker-authoring");
  assert.equal(parsed.description, "Routes Quicker headless action editing.");
  assert.deepEqual(parsed.allowedTools, ["docs"]);
  assert.equal(parsed.compatibility, "QuickerAgent");
  assert.equal(parsed.metadata.layer, "workflow");
  assert.match(parsed.body, /Route table here/);
});

test("parseSkillMd returns raw body when frontmatter missing", () => {
  const parsed = parseSkillMd("# No frontmatter\n");
  assert.equal(parsed.name, "");
  assert.equal(parsed.body, "# No frontmatter\n");
});
