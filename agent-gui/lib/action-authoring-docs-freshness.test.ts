import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, unlink, utimes, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import { build } from "esbuild";

const repo = resolve(import.meta.dirname, "../..");
let owned: string;
let api: typeof import("./action-authoring-docs") & { executeDocsTool(input: unknown): Promise<any>; setRoot(root: string, standalone?: boolean): void; networkCalls(): number; manifestReadsValue: number };
before(async () => {
  await mkdir(join(repo, ".tmp"), { recursive: true });
  owned = await mkdtemp(join(repo, ".tmp/node-docs-test-"));
  const modules: Record<string, string> = {
    skills: `import {readFile,stat} from 'node:fs/promises'; import {join} from 'node:path';
      export let root='';export let reads=0;export let standalone=false;export function setRoot(value,bundle=false){root=value;standalone=bundle;reads=0;process.env.QKRPC_REPO_ROOT=value;process.env.AGENT_GUI_ROOT=bundle?value:join(value,'agent-gui');}
      export function resolveSkillDir(name){return join(root,'docs/skills',name)}
      export function resolveSkillDirFromRecord(name,dir){return dir||resolveSkillDir(name)}
      export async function getAgentSkill(name){if(!/^[a-z-]+$/.test(name))return null;const skillDir=resolveSkillDir(name),skillMdPath=join(skillDir,'SKILL.md');try{await stat(skillMdPath);return {name,description:'fixture',skillDir,skillMdPath}}catch{return null}}
      export async function loadTopicsManifest(dir){reads++;try{return JSON.parse(await readFile(join(dir,'topics.json'),'utf8'))}catch{return null}}
      export {loadSkillInstructions,compactSkillBody} from ${JSON.stringify(join(repo, "agent-gui/lib/agent-skills/load.ts"))};
      export {parseSkillMd} from ${JSON.stringify(join(repo, "agent-gui/lib/skill-parse.ts"))};
      export async function formatAllPreloadedSkillsForPrompt(){return ''}`,
    http: `let count=0;export function networkCalls(){return count}export async function invokeQkrpcHttp(){count++;return {ok:true,parsed:{schema:{title:'implicit remote fallback'}}}}`,
    repo: `import {root,standalone} from 'fixture:skills';export function resolveQuickerRpcRepoRoot(){return standalone?null:root}`,
    context: `export function getRequestCwd(){}export function getRequestLastUserText(){}`,
    feedback: `export const attachToolFeedback=r=>r;export const formatLocalToolResult=(data,ok=true)=>({data,ok});`,
    view: `export const formatToolResultForAgent=(_tool,_input,result)=>result`,
    state: `export const buildAgentTurnState=()=>({intent:'general'})`,
    preload: `export const rankPatternSkills=()=>[];export const rankPatternSkillsScored=()=>[];export const shouldBlockDocsForPreloadedSkills=()=>false`,
    turn: `export function incrementDocsCallCountThisTurn(){}`,
    ai: `export const tool=value=>value`, empty: "",
  };
  const aliases: Record<string, string> = { "@/lib/agent-skills": "skills", "@/lib/agent-skills/discover": "skills", "@/lib/qkrpc-http": "http",
    "@/lib/qkrpc-request-context": "context", "@/lib/tool-result": "feedback", "@/lib/tool-result-agent-view": "view",
    "@/lib/agent-turn-state": "state", "@/lib/agent-skills/skill-intent-preload": "preload", "@/lib/program-turn-context": "turn", "@/lib/repo-root": "repo", ai: "ai", "server-only": "empty" };
  const output = join(owned, "fixture.mjs");
  await build({ stdin: { contents: `export * from ${JSON.stringify(join(repo, "agent-gui/lib/action-authoring-docs.ts"))};export {executeDocsTool} from ${JSON.stringify(join(repo, "agent-gui/lib/docs-tool.server.ts"))};export {setRoot,reads as manifestReadsValue} from 'fixture:skills';export {networkCalls} from 'fixture:http';`, resolveDir: join(repo, "agent-gui") },
    outfile: output, bundle: true, platform: "node", format: "esm", tsconfig: join(repo, "agent-gui/tsconfig.json"), plugins: [{ name: "owned-docs-ports", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => { const key = args.path.startsWith("fixture:") ? args.path.slice(8) : aliases[args.path]; return key ? { path: key, namespace: "docs-fixture" } : undefined; });
      builder.onLoad({ filter: /.*/, namespace: "docs-fixture" }, args => ({ contents: modules[args.path], resolveDir: join(repo, "agent-gui"), loader: "js" }));
    } }] });
  api = await import(pathToFileURL(output).href);
});
after(async () => { assert.ok(owned.startsWith(join(repo, ".tmp/node-docs-test-"))); await rm(owned, { recursive: true, force: true }); delete process.env.QKRPC_REPO_ROOT; delete process.env.AGENT_GUI_ROOT; });

async function fixture(topic = "alpha") {
  const root = await mkdtemp(join(owned, "case-"));
  const skill = join(root, "docs/skills/quicker-authoring");
  await mkdir(join(skill, "references"), { recursive: true });
  await mkdir(join(root, "QuickerRpc")); await mkdir(join(root, "agent-gui"));
  await writeFile(join(root, "QuickerRpc/version.json"), '{"release":"1.2.3","build":4}');
  await writeFile(join(skill, "SKILL.md"), "---\nname: quicker-authoring\ndescription: fixture\n---\n# Router");
  await writeFile(join(skill, "topics.json"), JSON.stringify({ skillName: "quicker-authoring", topics: [{ topic, description: "fixture" }], referenceCatalog: { [topic]: [{ id: "extra", title: "Extra", path: "alpha/extra.md" }] } }));
  const file = join(skill, "references", topic + ".md");
  await writeFile(file, "# Alpha\n\noldneedle original");
  await mkdir(join(skill, "references/alpha")); await writeFile(join(skill, "references/alpha/extra.md"), "# Extra\n\noldreference");
  await utimes(join(skill, "SKILL.md"), new Date("2030-01-01"), new Date("2030-01-01"));
  api.setRoot(root); return { root, skill, file };
}

test("a same-mtime or older-mtime replacement updates docs get and search in this process", async () => {
  const { file } = await fixture(); const originalTime = await stat(file);
  assert.equal((await api.getActionAuthoringDoc("alpha")).ok, true);
  await api.searchActionAuthoringDocs("oldneedle");
  await writeFile(file, "# Alpha\n\nnewneedle replacement"); await utimes(file, originalTime.atime, originalTime.mtime);
  const updated = await api.getActionAuthoringDoc("alpha"); assert.ok(updated.ok); assert.match(updated.doc.markdown, /newneedle/);
  assert.equal((await api.searchActionAuthoringDocs("newneedle")).items.some(item => item.topic === "alpha"), true);
  await writeFile(file, "# Alpha\n\nolderneedle replacement"); await utimes(file, new Date("2001-01-01"), new Date("2001-01-01"));
  const older = await api.getActionAuthoringDoc("alpha"); assert.ok(older.ok); assert.match(older.doc.markdown, /olderneedle/);
});
test("deleted topics and references cannot reuse a former successful row or index", async () => {
  const { skill, file } = await fixture(); assert.equal((await api.getActionAuthoringReference("alpha", "extra")).ok, true);
  await unlink(join(skill, "references/alpha/extra.md")); assert.equal((await api.getActionAuthoringReference("alpha", "extra")).ok, false);
  await unlink(file); assert.equal((await api.getActionAuthoringDoc("alpha")).ok, false);
  assert.equal((await api.searchActionAuthoringDocs("oldneedle")).items.some(item => item.topic === "alpha"), false);
});
test("declared source deletion never swaps in an old flat export or a legacy skill", async () => {
  const { root, skill, file } = await fixture();
  await mkdir(join(root, "docs/action-authoring/agent"), { recursive: true });
  await writeFile(join(root, "docs/action-authoring/agent/alpha.md"), "old exported alpha");
  await mkdir(join(root, "docs/skills/alpha"));
  await writeFile(join(root, "docs/skills/alpha/SKILL.md"), "---\nname: alpha\ndescription: legacy\n---\nold per-skill alpha");
  await writeFile(join(skill, "references/extra.md"), "old flat reference");
  await unlink(join(skill, "references/alpha/extra.md"));
  assert.equal((await api.getActionAuthoringReference("alpha", "extra")).ok, false);
  await unlink(file); assert.equal((await api.getActionAuthoringDoc("alpha")).ok, false);
  assert.equal((await api.listActionAuthoringTopics()).length, 0);
});
test("schema deletion or malformed JSON leaves local markdown explicitly schema-unavailable with zero network", async () => {
  const { root } = await fixture("action-data-schema"); const path = join(root, "docs/action-authoring-src/schemas/action-data-schema.json");
  await mkdir(dirname(path), { recursive: true }); await writeFile(path, '{"type":"object","title":"local"}');
  const loaded = await api.getActionAuthoringDoc("action-data-schema"); assert.ok(loaded.ok); assert.equal(loaded.doc.schema?.title, "local");
  const schemaRevision = loaded.doc.knowledge?.schema?.revision;
  const schemaTime = await stat(path);
  await writeFile(path, '{"type":"object","title":"new local"}'); await utimes(path, schemaTime.atime, schemaTime.mtime);
  const updated = await api.getActionAuthoringDoc("action-data-schema"); assert.ok(updated.ok); assert.equal(updated.doc.schema?.title, "new local");
  assert.notEqual(updated.doc.knowledge?.schema?.revision, schemaRevision);
  await unlink(path); const calls = api.networkCalls();
  const missing = await api.executeDocsTool({ action: "get", topic: "action-data-schema" });
  assert.equal(api.networkCalls(), calls); assert.equal(missing.data.success, true); assert.equal(missing.data.schema, undefined);
  assert.equal(missing.data.knowledge.schema.status, "unavailable"); assert.equal(missing.data.knowledge.schema.source, "unknown"); assert.match(missing.data.hint, /markdown only/i);
  await writeFile(path, "invalid-json"); assert.equal((await api.getActionAuthoringDoc("action-data-schema") as any).doc.knowledge.schema.status, "unavailable");
  assert.equal(api.networkCalls(), calls);
});
test("standalone bundles read their explicitly located local schema and never contact serve", async () => {
  const { root } = await fixture("form-spec"); api.setRoot(root, true);
  const path=join(root,"docs/action-authoring-src/schemas/form-spec-schema.json");
  await mkdir(dirname(path),{recursive:true}); await writeFile(path,'{"title":"bundle-local"}');
  const result=await api.getActionAuthoringDoc("form-spec"); assert.ok(result.ok); assert.equal(result.doc.schema?.title,"bundle-local");
  assert.equal(result.doc.knowledge?.schema?.source,"local-file"); assert.equal(api.networkCalls(),0);
});
test("on-demand docs bypass the skill body mtime cache without changing the default skill loader", async () => {
  const {root}=await fixture(); const folder=join(root,"docs/skills/quicker-run"); await mkdir(folder);
  const path=join(folder,"SKILL.md"); await writeFile(path,"---\nname: quicker-run\ndescription: fixture\n---\nold on-demand body");
  const first=await api.getActionAuthoringDoc("quicker-run"); assert.ok(first.ok);
  const time=await stat(path); await writeFile(path,"---\nname: quicker-run\ndescription: fixture\n---\nnew on-demand body"); await utimes(path,time.atime,time.mtime);
  const current=await api.getActionAuthoringDoc("quicker-run"); assert.ok(current.ok); assert.match(current.doc.markdown,/new on-demand/);
});
test("explicit legacy roots remain readable when no unified catalog exists", async () => {
  const {root,skill}=await fixture(); await unlink(join(skill,"topics.json"));
  const folder=join(root,"docs/action-authoring/agent"); await mkdir(folder,{recursive:true});
  await writeFile(join(folder,"legacy.md"),"# Legacy\n\ncurrent local legacy body");
  const result=await api.getActionAuthoringDoc("legacy"); assert.ok(result.ok); assert.match(result.doc.markdown,/current local legacy/);
  assert.equal(result.doc.knowledge?.source.kind,"local-guide"); assert.equal(result.doc.knowledge?.source.native,false);
});
test("provenance hashes the actual loaded markdown and stays local with unknown version", async () => {
  await fixture(); const loaded = await api.getActionAuthoringDoc("alpha"); assert.ok(loaded.ok);
  const knowledge = (loaded.doc as any).knowledge;
  assert.equal(knowledge.source.kind, "local-guide"); assert.equal(knowledge.source.version, "unknown"); assert.equal(knowledge.source.native, false);
  assert.equal(knowledge.content.revision, "sha256:" + createHash("sha256").update(loaded.doc.markdown).digest("hex"));
  assert.equal((await api.searchActionAuthoringDocs("oldneedle")).items[0]?.knowledge?.content.revision, knowledge.content.revision);
  const before=api.manifestReadsValue; await api.searchActionAuthoringDocs("oldneedle"); assert.equal(api.manifestReadsValue-before,1,"one request builds one current row/index snapshot");
  assert.equal((await api.getActionAuthoringReference("alpha","../outside")).ok,false);
});
