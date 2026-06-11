import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  discoverAgentDefs,
  resetAgentDefsCache,
} from "@/lib/agent-defs/discover-core";

test("discoverAgentDefs prefers workspace skills over bundled names", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "qka-defs-"));
  try {
    const skillDir = join(cwd, ".quicker", "skills", "demo-skill");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      `---
name: demo-skill
description: Workspace demo skill
---
Body
`,
      "utf8",
    );
    resetAgentDefsCache();

    const catalog = await discoverAgentDefs(cwd);
    const demo = catalog.skills.find((s) => s.name === "demo-skill");
    assert.ok(demo);
    assert.equal(demo.scope, "workspace");
    assert.ok(
      catalog.skills.some((s) => s.name === "quicker-authoring" && s.scope === "bundled"),
    );
  } finally {
    resetAgentDefsCache();
    await rm(cwd, { recursive: true, force: true });
  }
});
