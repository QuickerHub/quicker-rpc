import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  expandCommandPlaceholders,
  parseSlashCommandInput,
} from "@/lib/agent-defs/command-expand";
import { expandSlashCommand } from "@/lib/agent-defs/command-expand";
import { resetAgentDefsCache } from "@/lib/agent-defs/discover-core";

test("parseSlashCommandInput parses name and arguments", () => {
  assert.deepEqual(parseSlashCommandInput("/hot-update foo bar"), {
    name: "hot-update",
    arguments: "foo bar",
  });
  assert.equal(parseSlashCommandInput("not a command"), null);
});

test("expandCommandPlaceholders replaces $ARGUMENTS and $1..$9", () => {
  const body = expandCommandPlaceholders(
    "Run deploy with $ARGUMENTS and first=$1 second=$2",
    "alpha beta",
  );
  assert.match(body, /Run deploy with alpha beta and first=alpha second=beta/);
});

test("expandSlashCommand loads workspace command definition", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "qka-cmd-"));
  try {
    const commandsDir = join(cwd, ".quicker", "commands");
    await mkdir(commandsDir, { recursive: true });
    await writeFile(
      join(commandsDir, "deploy.md"),
      `---
description: Deploy app
---
Run deploy with $ARGUMENTS and first=$1 second=$2
`,
      "utf8",
    );
    resetAgentDefsCache();

    const expanded = await expandSlashCommand("/deploy alpha beta", cwd);
    assert.ok(expanded);
    assert.equal(expanded.command.name, "deploy");
    assert.match(
      expanded.expandedBody,
      /Run deploy with alpha beta and first=alpha second=beta/,
    );
  } finally {
    resetAgentDefsCache();
    await rm(cwd, { recursive: true, force: true });
  }
});
