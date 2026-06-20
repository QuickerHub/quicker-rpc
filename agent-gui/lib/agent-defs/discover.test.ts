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

test("discoverAgentDefs includes bundled tool-test-echo subagent", async () => {
  resetAgentDefsCache();
  const catalog = await discoverAgentDefs("");
  const echo = catalog.agents.find((a) => a.name === "tool-test-echo");
  assert.ok(echo);
  assert.equal(echo.scope, "bundled");
});

test("discoverAgentDefs includes bundled readonly-explore subagent", async () => {
  resetAgentDefsCache();
  const catalog = await discoverAgentDefs("");
  const explore = catalog.agents.find((a) => a.name === "readonly-explore");
  assert.ok(explore);
  assert.equal(explore.scope, "bundled");
  assert.ok(explore.tools?.includes("Grep"));
});

test("discoverAgentDefs includes bundled author and verify commands", async () => {
  resetAgentDefsCache();
  const catalog = await discoverAgentDefs("");
  const author = catalog.commands.find((c) => c.name === "author");
  const verify = catalog.commands.find((c) => c.name === "verify");
  const explain = catalog.commands.find((c) => c.name === "explain-action");
  assert.ok(author);
  assert.equal(author.scope, "bundled");
  assert.ok(author.allowedTools.includes("workspace_program"));
  assert.ok(verify);
  assert.equal(verify.scope, "bundled");
  assert.ok(verify.allowedTools.includes("qkrpc_action_debug"));
  assert.ok(explain);
  assert.equal(explain.scope, "bundled");
});

test("discoverAgentDefs includes authoring-verify subagent with inherit", async () => {
  resetAgentDefsCache();
  const catalog = await discoverAgentDefs("");
  const verify = catalog.agents.find((a) => a.name === "authoring-verify");
  assert.ok(verify);
  assert.deepEqual(verify.inherit, ["skills", "workspace"]);
});

test("discoverAgentDefs includes bundled step-runner-lookup subagent", async () => {
  resetAgentDefsCache();
  const catalog = await discoverAgentDefs("");
  const lookup = catalog.agents.find((a) => a.name === "step-runner-lookup");
  assert.ok(lookup);
  assert.equal(lookup.scope, "bundled");
  assert.ok(lookup.tools?.includes("qkrpc_step_runner_get"));
  assert.deepEqual(lookup.inherit, ["skills"]);
});

test("discoverAgentDefs includes bundled action-library-search subagent", async () => {
  resetAgentDefsCache();
  const catalog = await discoverAgentDefs("");
  const search = catalog.agents.find((a) => a.name === "action-library-search");
  assert.ok(search);
  assert.equal(search.scope, "bundled");
  assert.ok(search.tools?.includes("qkrpc_action_query"));
  assert.ok(search.tools?.includes("qkrpc_action_get"));
  assert.deepEqual(search.inherit, ["skills"]);
});
