import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, unlink, utimes, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import { build } from "esbuild";
import type { SubagentDef } from "../agent-defs/types";

const repo = resolve(import.meta.dirname, "../../..");
const originalPreload = process.env.HARNESS_PRELOAD_SKILLS;
let owned: string;
let api: {
  setRoot(root: string): void;
  buildSystemInstructions: typeof import("../instructions").buildSystemInstructions;
  buildSubagentSystemPrompt: typeof import("../agent-defs/subagent-system.server").buildSubagentSystemPrompt;
  loadSkillInstructions: typeof import("./load").loadSkillInstructions;
  discoverAgentSkills: typeof import("./discover").discoverAgentSkills;
  runWithAgentRequestContext: typeof import("../qkrpc-request-context").runWithAgentRequestContext;
  SKILL_LOAD_TOOL_DEF: { execute(input: { name: string; offset: number; limit: number }, options: { toolCallId: string; messages: [] }): Promise<any> };
  holdNextRead(path: string): { captured: Promise<void>; release(): void };
};

before(async () => {
  await mkdir(join(repo, ".tmp"), { recursive: true });
  owned = await mkdtemp(join(repo, ".tmp/skill-prompt-test-"));
  const ports: Record<string, string> = {
    "server-only": "",
    "fixture:roots": `let root; export function setRoot(value){root=value} export function currentRoot(){if(!root)throw Error('fixture root required');return root}`,
    "@/lib/repo-root": `export { currentRoot as resolveQuickerRpcRepoRoot } from 'fixture:roots';`,
    "@/lib/agent-gui-root": `import {join} from 'node:path';import {currentRoot} from 'fixture:roots';export function resolveAgentGuiRoot(){return join(currentRoot(),'agent-gui')}`,
    "@/lib/quicker-agent-paths": `import {join} from 'node:path';import {currentRoot} from 'fixture:roots';export function resolveQuickerAgentAppDataDirectory(){return join(currentRoot(),'user')}`,
    "node:fs/promises": `import * as real from 'fixture:real-fs';import {resolve,sep} from 'node:path';
      const owned=${JSON.stringify(owned)};
      function check(path){if(!resolve(String(path)).startsWith(owned+sep))throw Error('non-fixture filesystem read: '+path)}
      let held;
      export function holdNextRead(path){let captured,release;const read=new Promise(r=>captured=r),released=new Promise(r=>release=r);held={path,captured,released};return {captured:read,release}}
      export async function readFile(path,...args){check(path);const bytes=await real.readFile(path,...args);if(held&&String(path)===held.path){const own=held;held=undefined;own.captured();await own.released}return bytes}
      export async function stat(path,...args){check(path);return real.stat(path,...args)}
      export async function readdir(path,...args){check(path);return real.readdir(path,...args)}`,
  };
  const output = join(owned, "fixture.mjs");
  const result = await build({
    stdin: { contents: `export {buildSystemInstructions} from '@/lib/instructions';export {buildSubagentSystemPrompt} from '@/lib/agent-defs/subagent-system.server';export {loadSkillInstructions} from '@/lib/agent-skills/load';export {discoverAgentSkills} from '@/lib/agent-skills/discover';export {runWithAgentRequestContext} from '@/lib/qkrpc-request-context';export {SKILL_LOAD_TOOL_DEF} from '@/lib/skill-load-tool.server';export {setRoot} from 'fixture:roots';export {holdNextRead} from 'node:fs/promises';`, resolveDir: join(repo, "agent-gui"), loader: "ts" },
    outfile: output, bundle: true, platform: "node", format: "esm", metafile: true,
    tsconfig: join(repo, "agent-gui/tsconfig.json"),
    plugins: [{ name: "owned-skill-prompt-roots", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => args.path === "fixture:real-fs"
        ? { path: "node:fs/promises", external: true }
        : args.path in ports ? { path: args.path, namespace: "skill-fixture-port" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "skill-fixture-port" }, args => ({ contents: ports[args.path], loader: "js", resolveDir: join(repo, "agent-gui") }));
    } }],
  });
  for (const path of Object.keys(result.metafile!.inputs)) {
    assert.doesNotMatch(path.replaceAll("\\", "/"), /(?:^|\/)lib\/(?:db\/|qkrpc(?:\.ts|-http\.ts)|llm-|tools\.ts)/,
      "Prompt fixtures must not import live host, model, database or tool implementations");
  }
  api = await import(pathToFileURL(output).href);
});

after(async () => {
  if (originalPreload === undefined) delete process.env.HARNESS_PRELOAD_SKILLS;
  else process.env.HARNESS_PRELOAD_SKILLS = originalPreload;
  assert.ok(owned.startsWith(join(repo, ".tmp/skill-prompt-test-")));
  await rm(owned, { recursive: true, force: true });
});

const subagent: SubagentDef = { name: "fixture", description: "fixture child", body: "fixture child instructions", inherit: ["skills"],
  model: null, filePath: "fixture", scope: "bundled", warnings: [] };
const stamp = new Date("2030-01-01T00:00:00Z");
const earlierStamp = new Date("2001-01-01T00:00:00Z");

async function write(path: string, content: string, time = stamp) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  await utimes(path, time, time);
}

function skillMarkdown(name: string, body: string) {
  return `---\nname: ${name}\ndescription: fixture ${name}\n---\n${body}`;
}

async function fixture(label = "one") {
  const root = await mkdtemp(join(owned, "case-"));
  const authoringDir = join(root, "docs/skills/quicker-authoring");
  const evalDir = join(root, "docs/skills/quicker-eval-expression");
  const authoringPath = join(authoringDir, "prompt-tier0.md");
  const evalPath = join(evalDir, "prompt-tier2.md");
  await write(join(authoringDir, "SKILL.md"), skillMarkdown("quicker-authoring", `authoring fallback ${label}`));
  await write(join(evalDir, "SKILL.md"), skillMarkdown("quicker-eval-expression", `eval fallback ${label}`));
  await write(authoringPath, `## Hard rules\nauthoring marker ${label}`);
  await write(evalPath, `## Pick (P4)\neval marker ${label}`, earlierStamp);
  const cwd = join(root, "workspace"); await mkdir(cwd);
  api.setRoot(root);
  return { root, cwd, authoringDir, evalDir, authoringPath, evalPath };
}

async function assembled(cwd: string) {
  return api.runWithAgentRequestContext({ cwd }, () => Promise.all([
    api.buildSystemInstructions(cwd, "agent"),
    api.buildSystemInstructions(cwd, "ask"),
    api.buildSubagentSystemPrompt(subagent, cwd),
    api.buildSubagentSystemPrompt({ ...subagent, inherit: ["all"] }, cwd),
  ]));
}

for (const mode of ["0", "1"]) {
  test(`main and subagent ${mode === "0" ? "essentials" : "full"} prompts observe same/older mtime body changes and root changes`, async () => {
    process.env.HARNESS_PRELOAD_SKILLS = mode;
    const first = await fixture("first");
    for (const prompt of await assembled(first.cwd)) assert.match(prompt, /eval marker first/);
    await write(first.evalPath, "## Pick (P4)\neval marker replaced", earlierStamp);
    assert.equal((await stat(first.evalPath)).mtimeMs, earlierStamp.getTime());
    for (const prompt of await assembled(first.cwd)) {
      assert.match(prompt, /eval marker replaced/); assert.doesNotMatch(prompt, /eval marker first/);
    }
    await write(first.authoringPath, "## Hard rules\nauthoring marker older", earlierStamp);
    for (const prompt of await assembled(first.cwd)) assert.match(prompt, /authoring marker older/);
    const second = await fixture("second");
    for (const prompt of await assembled(second.cwd)) {
      assert.match(prompt, /eval marker second/); assert.doesNotMatch(prompt, /marker (?:first|replaced|older)/);
    }
  });

  test(`main and subagent ${mode === "0" ? "essentials" : "full"} prompts observe override deletion and restoration`, async () => {
    process.env.HARNESS_PRELOAD_SKILLS = mode;
    const current = await fixture();
    await assembled(current.cwd);
    await unlink(current.evalPath);
    if (mode === "0") {
      // Essentials has always required the declared tier file; do not silently substitute a body.
      await assert.rejects(api.buildSystemInstructions(current.cwd, "agent"), /ENOENT/);
      await assert.rejects(api.buildSubagentSystemPrompt(subagent, current.cwd), /ENOENT/);
    } else {
      for (const prompt of await assembled(current.cwd)) {
        assert.match(prompt, /eval fallback one/); assert.doesNotMatch(prompt, /eval marker one/);
      }
    }
    await write(current.evalPath, "## Pick (P4)\neval marker restored", earlierStamp);
    for (const prompt of await assembled(current.cwd)) assert.match(prompt, /eval marker restored/);
  });

  test(`late ${mode === "0" ? "essentials" : "full"} prompt reads preserve their snapshot without contaminating newer prompts`, { timeout: 10000 }, async () => {
    process.env.HARNESS_PRELOAD_SKILLS = mode;
    const current = await fixture("captured");
    const held = api.holdNextRead(current.evalPath);
    const old = api.buildSystemInstructions(current.cwd, "agent");
    try {
      await held.captured;
      await write(current.evalPath, "## Pick (P4)\neval marker newer", earlierStamp);
      for (const prompt of await assembled(current.cwd)) assert.match(prompt, /eval marker newer/);
      held.release();
      assert.match(await old, /eval marker captured/);
      for (const prompt of await assembled(current.cwd)) {
        assert.match(prompt, /eval marker newer/); assert.doesNotMatch(prompt, /eval marker captured/);
      }
    } finally { held.release(); await old; }
  });
}

test("default skill body reads keep SKILL/override precedence across same-mtime updates, deletion and restoration", async () => {
  const current = await fixture();
  const path = join(current.evalDir, "SKILL.md");
  assert.match((await api.loadSkillInstructions("quicker-eval-expression", current.cwd))!.body, /eval marker one/);
  await write(path, skillMarkdown("quicker-eval-expression", "newer fallback body"));
  await unlink(current.evalPath);
  assert.equal((await api.loadSkillInstructions("quicker-eval-expression", current.cwd))!.body, "newer fallback body");
  await write(path, skillMarkdown("quicker-eval-expression", "same timestamp fallback body"));
  assert.equal((await api.loadSkillInstructions("quicker-eval-expression", current.cwd))!.body, "same timestamp fallback body");
  await write(current.evalPath, "restored override body", earlierStamp);
  assert.equal((await api.loadSkillInstructions("quicker-eval-expression", current.cwd))!.body, "restored override body");
  assert.equal((await api.loadSkillInstructions("quicker-eval-expression", current.cwd, { fresh: true }))!.body, "restored override body");
});

test("skill_load and discovery refresh scope winners, missing skills and same-mtime renames without resets", async () => {
  const current = await fixture();
  const name = "fixture-current";
  const workspace = join(current.cwd, ".quicker/skills", name, "SKILL.md");
  const user = join(current.root, "user/agent-defs/skills", name, "SKILL.md");
  const bundled = join(current.root, "docs/skills", name, "SKILL.md");
  const content = (name: string, body: string) => skillMarkdown(name, body).replace("description:", "allowed-tools: Read\ndescription:");
  await write(workspace, content(name, "workspace skill body"), earlierStamp);
  await write(user, content(name, "user skill body"), earlierStamp);
  await write(bundled, content(name, "bundled skill body"), earlierStamp);
  const load = (skillName = name) => api.runWithAgentRequestContext({ cwd: current.cwd }, () => api.SKILL_LOAD_TOOL_DEF.execute(
    { name: skillName, offset: 0, limit: 7000 }, { toolCallId: "fixture", messages: [] }));
  const expectBody = async (scope: string, body: string) => {
    const result = await load();
    assert.equal(result.ok, true); assert.equal(result.data.skill.scope, scope);
    assert.equal(result.data.content, body); assert.deepEqual(result.data.skill.allowedTools, ["Read"]);
  };
  await expectBody("workspace", "workspace skill body");
  await unlink(workspace); await expectBody("user", "user skill body");
  await unlink(user); await expectBody("bundled", "bundled skill body");
  await unlink(bundled);
  assert.equal((await load()).data.errorCode, "skill_not_found");
  await write(workspace, content(name, "restored workspace body"), earlierStamp);
  await expectBody("workspace", "restored workspace body");

  await write(workspace, content("fixture-renamed", "renamed workspace body"), earlierStamp);
  assert.equal((await load()).data.errorCode, "skill_not_found");
  assert.equal((await load("fixture-renamed")).data.content, "renamed workspace body");
  const addedName = "fixture-new";
  assert.equal((await load(addedName)).data.errorCode, "skill_not_found");
  await write(join(current.cwd, ".quicker/skills", addedName, "SKILL.md"), content(addedName, "newly present body"), earlierStamp);
  assert.equal((await load(addedName)).data.content, "newly present body");
  const catalog = await api.discoverAgentSkills(current.cwd);
  assert.ok(catalog.some(skill => skill.name === "fixture-renamed"));
  assert.ok(catalog.some(skill => skill.name === addedName));
  assert.ok(!catalog.some(skill => skill.name === name));
});
