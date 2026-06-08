import test from "node:test";
import assert from "node:assert/strict";
import {
  discoverAgentSkills,
  resetAgentSkillsCache,
} from "@/lib/agent-skills/discover";
import { validateSkillName } from "@/lib/agent-skills/validate";

test("discoverAgentSkills finds quicker-authoring in repo", async () => {
  resetAgentSkillsCache();
  const skills = await discoverAgentSkills();
  const authoring = skills.find((s) => s.name === "quicker-authoring");
  assert.ok(authoring, "expected quicker-authoring skill");
  assert.ok(authoring.description.length > 0);
  assert.match(authoring.skillMdPath, /SKILL\.md$/);
});

test("validateSkillName warns on directory mismatch", () => {
  const warnings = validateSkillName("other-name", "quicker-authoring");
  assert.ok(warnings.some((w) => w.includes("does not match directory")));
});
