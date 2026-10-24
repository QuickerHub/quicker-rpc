import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  loadAuthoringDocFixtureRows,
  resolveAuthoringReferencesRoot,
  resolveAuthoringSkillsRoot,
} from "@/lib/action-authoring-docs-fixtures";
import {
  isBlockedReferenceKey,
  normalizeReferenceKey,
} from "@/lib/action-authoring-docs.shared";
import {
  compactSkillBody,
  loadSkillInstructions,
  resetSkillBodyCache,
} from "@/lib/agent-skills/load";
import { resetAgentSkillsCache } from "@/lib/agent-skills/discover";
import { SKILL_TIER2_BODY_FILES } from "@/lib/agent-skills/paths";
import { resolveQuickerRpcRepoRoot } from "@/lib/repo-root";

let profileDirectory: string;
const previousProfileDirectory = process.env.QUICKER_AGENT_DATA_DIR;

before(async () => {
  const repo = resolveQuickerRpcRepoRoot();
  assert.ok(repo, "reference tests require the repository's declared resources");
  const temporaryRoot = join(repo, ".tmp");
  await mkdir(temporaryRoot, { recursive: true });
  profileDirectory = await mkdtemp(join(temporaryRoot, "docs-reference-"));
  process.env.QUICKER_AGENT_DATA_DIR = profileDirectory;
  resetAgentSkillsCache();
  resetSkillBodyCache();
});

after(async () => {
  if (previousProfileDirectory === undefined) delete process.env.QUICKER_AGENT_DATA_DIR;
  else process.env.QUICKER_AGENT_DATA_DIR = previousProfileDirectory;
  resetAgentSkillsCache();
  resetSkillBodyCache();
  if (profileDirectory) await rm(profileDirectory, { recursive: true, force: true });
});

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
  it("loads every declared reference id and its current source body", async () => {
    const skillsRoot = resolveAuthoringSkillsRoot();
    const manifest = JSON.parse(await readFile(join(skillsRoot, "topics.json"), "utf8")) as {
      referenceCatalog: Record<string, Array<{ id: string; path: string }>>;
    };
    const declared = Object.entries(manifest.referenceCatalog).flatMap(([topic, references]) =>
      references.filter((reference) => reference.id !== "_catalog")
        .map((reference) => ({ topic, ...reference })),
    );
    assert.ok(declared.length > 0, "the generated catalog must declare reference resources");
    assert.ok(declared.some((reference) => reference.id.includes("/")), "keep nested-id coverage");
    const rows = await loadAuthoringDocFixtureRows();
    const key = (topic: string, reference: string) => JSON.stringify([topic, reference]);
    assert.deepEqual(
      rows.filter((row) => row.reference).map((row) => key(row.topic, row.reference!)).sort(),
      declared.map((reference) => key(reference.topic, reference.id)).sort(),
      "no declared reference may be omitted, duplicated or replaced by an undeclared row",
    );
    for (const reference of declared) {
      const sourceRoot = reference.path.replace(/\\/g, "/").startsWith("step-modules/")
        ? resolveAuthoringReferencesRoot()
        : join(skillsRoot, "references");
      const expected = await readFile(join(sourceRoot, reference.path), "utf8");
      const row = rows.find((candidate) => key(candidate.topic, candidate.reference ?? "") === key(reference.topic, reference.id));
      assert.equal(row?.markdown, expected, `current source body: ${reference.topic}/${reference.id}`);
    }
  });
});

describe("on-demand skill load", () => {
  it("loads quicker-run SKILL.md body", async () => {
    const skill = await loadSkillInstructions("quicker-run", "");
    assert.ok(skill?.body);
    assert.equal(skill.scope, "bundled");
    assert.match(skill!.body, /qkrpc_action/i);
  });
});

describe("quicker-eval-expression skill", () => {
  it("loads the declared tier-2 body with batch assignment guidance", async () => {
    const name = "quicker-eval-expression";
    const bodyFile = SKILL_TIER2_BODY_FILES[name];
    assert.ok(bodyFile, "the expression skill declares an effective instruction body");
    const skill = await loadSkillInstructions(name, "");
    assert.ok(skill?.body);
    assert.equal(skill.scope, "bundled");
    const expected = compactSkillBody(await readFile(join(skill.skillDir, bodyFile), "utf8"));
    assert.equal(skill.body, expected, "load the current configured body, not a stale copy or router-only SKILL.md");
    assert.notEqual(skill.body, compactSkillBody(skill.parsed.body));
    assert.match(skill.body, /sys:evalexpression/);
    assert.match(skill.body, /\{varKey\}=/);
  });
});
