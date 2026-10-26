import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { DOCUMENTATION_ONLY_PATHS, classifyCiChanges, classifyEnvironment, classifyRawDiff } from "./classify-ci-changes.mjs";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const temporary = join(repository, ".tmp");
const script = join(repository, "scripts/ci/classify-ci-changes.mjs");
const doc = DOCUMENTATION_ONLY_PATHS[0];
const productionPaths = ["README.md", "agent-gui/package.json", "agent-gui/pnpm-lock.yaml", "agent-gui/lib/instructions.ts",
  "QuickerRpc/src/QuickerRpc.Transport/QuickerRpcClient.cs", "Directory.Packages.props", "sdk/Quicker.Sdk/Sdk/Sdk.props",
  "build.ps1", "publish/Publish-QuickerAgent.ps1", ".github/workflows/ci.yml", ".gitattributes", ".gitmodules",
  "scripts/ci/classify-ci-changes.mjs", "docs/action-authoring-src/workflows/program-source.md", "docs/skills/quicker-authoring/SKILL.md",
  "agent-gui/docs/skills/quicker-authoring/SKILL.md", "unknown.md", "QuickerRpc/version.json",
  "cursor-plugin/quicker-rpc/.cursor-plugin/plugin.json", "docs/action-authoring/cli/overview.md",
  "docs/authoring-references/steps/example.md", "docs/knowledge/example.md", "docs/agent-rules/codex-qkrpc.md"];

function fixture(t, omitted = []) {
  mkdirSync(temporary, { recursive: true });
  const sandbox = mkdtempSync(join(temporary, "ci-scope-test-")), root = join(sandbox, "repo"), hooks = join(sandbox, "hooks");
  t.after(() => {
    const child = relative(temporary, sandbox);
    assert.ok(child && !child.startsWith("..") && !child.includes(sep));
    rmSync(sandbox, { recursive: true, force: true });
  });
  mkdirSync(root); mkdirSync(hooks);
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" };
  for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_COMMON_DIR"]) delete env[name];
  function git(args, cwd = root, input) {
    const result = spawnSync("git", ["-c", "user.name=CI fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false",
      "-c", "core.autocrlf=false", "-c", `core.hooksPath=${hooks}`, ...args], { cwd, env, input, windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr?.toString());
    return result.stdout;
  }
  const file = (path, content = `${path}\n`) => { const target = join(root, path); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, content); };
  git(["init", "--initial-branch=main", `--template=${hooks}`]);
  for (const path of [...DOCUMENTATION_ONLY_PATHS, ...productionPaths]) if (!omitted.includes(path)) file(path, path === ".gitmodules" ? "" : `${path}\n`);
  const commit = (message, stage = true) => { if (stage) git(["add", "--all"]); git(["commit", "--no-gpg-sign", "-m", message]); return git(["rev-parse", "HEAD"]).toString().trim(); };
  const base = commit("base fixture");
  const pr = (head, baseSha = base) => ({ pull_request: { base: { sha: baseSha, repo: { full_name: "fixture/repository" } }, head: { sha: head, repo: { full_name: "fixture/repository" } } } });
  const classify = (sha, event = pr(sha), eventName = "pull_request", extra = {}) => classifyCiChanges({ repository: root, eventName, event, sha, ...extra });
  return { sandbox, root, env, file, git, commit, base, pr, classify };
}

const raw = (path = doc, oldMode = "100644", newMode = "100644", status = "M", old = "1".repeat(40), next = "2".repeat(40)) =>
  Buffer.from(`:${oldMode} ${newMode} ${old} ${next} ${status}\0${path}\0`);

test("the documentation optimization is an exact, immutable five-path policy", () => {
  assert.deepEqual(DOCUMENTATION_ONLY_PATHS, ["docs/product/README.md", "docs/design/quicker-rpc-core-architecture.md",
    "docs/design/quicker-rpc-plugin-v2.md", "agent-gui/DESIGN.md", "docs/engineering/ci.md"]);
  assert.equal(Object.isFrozen(DOCUMENTATION_ONLY_PATHS), true);
  assert.equal(classifyRawDiff(Buffer.concat(DOCUMENTATION_ONLY_PATHS.map((path) => raw(path)))).scope, "docs-only");
});

test("a real checked-out PR merge compares the entire tested tree against the event base", (t) => {
  const f = fixture(t);
  f.git(["checkout", "-b", "topic"]); f.file(doc, "topic documentation\n"); const head = f.commit("topic docs");
  f.git(["checkout", "main"]); f.file(productionPaths[3], "new base runtime\n"); const base = f.commit("new base runtime");
  f.git(["merge", "--no-ff", "topic", "-m", "tested merge"]); const sha = f.git(["rev-parse", "HEAD"]).toString().trim();
  const result = f.classify(sha, f.pr(head, base));
  assert.equal(result.scope, "docs-only"); assert.equal(result.changedFiles, 1);
  assert.equal(result.base, base); assert.equal(result.head, sha);
});

test("every non-whitelisted runtime, SDK, installer, metadata and knowledge input retains full CI", (t) => {
  const f = fixture(t); let before = f.base;
  for (const path of productionPaths) {
    f.file(path, path === ".gitmodules" ? "# changed fixture\n" : "changed fixture\n"); const head = f.commit(`change ${path}`);
    const result = f.classify(head, f.pr(head, before));
    assert.equal(result.scope, "full", path); assert.equal(result.changedFiles, 1, path);
    before = head;
  }
});

test("an earlier runtime commit cannot be hidden by a docs-only tip commit", (t) => {
  const f = fixture(t); f.file(productionPaths[3], "runtime change\n"); const middle = f.commit("runtime");
  f.file(doc, "last documentation change\n"); const head = f.commit("docs tip");
  assert.equal(f.classify(head, f.pr(head, middle)).scope, "docs-only");
  const result = f.classify(head); assert.equal(result.scope, "full"); assert.equal(result.changedFiles, 2);
});

for (const operation of ["rename", "delete", "chmod", "symlink", "gitlink", "new-file"]) test(`a real ${operation} never becomes docs-only`, (t) => {
  const f = fixture(t, operation === "new-file" ? [doc] : []);
  if (operation === "rename") f.git(["mv", "-f", doc, DOCUMENTATION_ONLY_PATHS[1]]);
  else if (operation === "delete") f.git(["rm", doc]);
  else if (operation === "chmod") f.git(["update-index", "--chmod=+x", doc]);
  else if (operation === "new-file") f.file(doc, "new exact-path documentation\n");
  else {
    const oid = operation === "gitlink" ? f.base : f.git(["hash-object", "-w", "--stdin"], f.root, Buffer.from("./owned-target\n")).toString().trim();
    // Write real Git tree modes without requiring Windows symlink privileges.
    f.git(["update-index", "--add", "--cacheinfo", `${operation === "gitlink" ? "160000" : "120000"},${oid},${doc}`]);
  }
  const head = f.commit(operation, operation === "new-file");
  assert.equal(f.classify(head).scope, "full");
});

test("valid main/master pushes use the complete before/after range; other events stay full", (t) => {
  const f = fixture(t); f.file(doc, "push docs\n"); const sha = f.commit("push docs");
  const push = { before: f.base, after: sha, forced: false, deleted: false, created: false, ref: "refs/heads/main" };
  for (const ref of ["refs/heads/main", "refs/heads/master"]) assert.equal(f.classify(sha, { ...push, ref }, "push").scope, "docs-only");
  for (const key of ["forced", "deleted", "created"]) for (const value of [true, undefined, null, 0, "false"])
    assert.equal(f.classify(sha, { ...push, [key]: value }, "push").scope, "full", `${key}=${value}`);
  for (const change of [{ ref: "refs/tags/v1" }, { ref: "refs/heads/unknown" }, { after: f.base }, { before: "0".repeat(40) }])
    assert.equal(f.classify(sha, { ...push, ...change }, "push").scope, "full");
  for (const eventName of ["workflow_dispatch", "pull_request_target", "merge_group", "schedule", "unknown", undefined])
    assert.equal(f.classify(sha, push, eventName).scope, "full");
});

test("forks, missing repository identity, missing commits and checkout mismatch stay full", (t) => {
  const f = fixture(t); f.file(doc, "docs revision\n"); const head = f.commit("docs");
  for (const repo of [null, {}, { full_name: "fork/repository" }, { full_name: "" }, { full_name: 1 }]) {
    const event = f.pr(head); event.pull_request.head.repo = repo;
    assert.equal(f.classify(head, event).scope, "full");
  }
  for (const field of ["base", "head"]) {
    const event = f.pr(head); event.pull_request[field].sha = "f".repeat(40);
    assert.equal(f.classify(head, event).scope, "full");
  }
  f.file(productionPaths[3], "checkout has unreported runtime changes\n"); f.commit("different checked-out commit");
  assert.equal(f.classify(head).reason, "checkout-mismatch");
});

test("genuine shallow history and failed Git operations cannot authorize a skip", (t) => {
  const f = fixture(t); f.file(doc, "shallow docs\n"); const head = f.commit("docs");
  const clone = join(f.sandbox, "shallow"); f.git(["clone", "--no-local", "--depth=1", f.root, clone], f.sandbox);
  const result = classifyCiChanges({ repository: clone, eventName: "pull_request", event: f.pr(head), sha: head });
  assert.equal(result.scope, "full"); assert.equal(result.reason, "comparison-unavailable");
  for (let failAt = 0; failAt < 4; failAt++) {
    let calls = 0;
    assert.equal(f.classify(head, f.pr(head), "pull_request", { git: (_repo, args) => {
      if (calls++ === failAt) throw new Error("synthetic unavailable history/diff");
      return f.git(args);
    } }).scope, "full");
  }
});

test("empty, truncated, contradictory, oversized and non-exact raw records stay full", () => {
  const good = raw();
  const invalid = [undefined, "not bytes", Buffer.alloc(0), good.subarray(0, good.length - 1), Buffer.from(":truncated\0"),
    Buffer.concat([good, good]), raw(doc, "100644", "100644", "M", "0".repeat(40)),
    raw(doc, "100644", "100644", "M", "1".repeat(40), "1".repeat(40)),
    raw(doc, "100644", "100644", "M", "1".repeat(40), "0".repeat(40)),
    raw(doc, "100644", "100644", "R100"), Buffer.concat([good.subarray(0, good.length - 1), Buffer.from([0xff, 0])]),
    Buffer.alloc(8 * 1024 * 1024 + 1)];
  for (const bytes of invalid) assert.equal(classifyRawDiff(bytes).scope, "full");
  for (const path of [`./${doc}`, doc.toUpperCase(), doc.replaceAll("/", "\\"), `unknown/../${doc}`, `${doc}\n`, `${doc}\t`, "docs/未知.md"])
    assert.equal(classifyRawDiff(raw(path)).scope, "full", path);
});

test("environment and CLI classification preserve the same conservative policy", (t) => {
  const f = fixture(t); f.file(doc, "CLI docs\n"); const head = f.commit("docs");
  const eventFile = join(f.sandbox, "event.json"), output = join(f.sandbox, "github-output");
  writeFileSync(eventFile, JSON.stringify(f.pr(head)));
  const env = { ...f.env, GITHUB_EVENT_PATH: eventFile, GITHUB_WORKSPACE: f.root, GITHUB_EVENT_NAME: "pull_request", GITHUB_SHA: head, GITHUB_OUTPUT: output };
  assert.equal(classifyEnvironment(env).scope, "docs-only");
  const result = spawnSync(process.execPath, [script], { cwd: f.root, env, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).scope, "docs-only");
  assert.equal(readFileSync(output, "utf8"), "scope=docs-only\n");
  writeFileSync(eventFile, "invalid JSON"); assert.equal(classifyEnvironment(env).scope, "full");
  assert.equal(classifyEnvironment({ ...env, GITHUB_EVENT_PATH: join(f.sandbox, "missing") }).scope, "full");
});
