import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mock, test } from "node:test";
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { executeWorkspaceFileTool } from "./workspace-general-file-tool.server";
import { claimSourceDocumentOwner, withSourceDocumentOwner, withExternalSourceDocumentWrite } from "./source-document-owner.server";
import { runWithAgentRequestContextAsync } from "./qkrpc-request-context";

async function fixture(run: (root: string) => Promise<void>) {
  const parent = fileURLToPath(new URL("../../.tmp/source-bundle-designer/owners/", import.meta.url));
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(join(parent, "case-"));
  try { await run(root); }
  finally { assert.ok(root.startsWith(join(parent, "case-"))); await rm(root, { recursive: true, force: true }); }
}
test("source owners protect YAML, future resources, sidecars and direct saves through canonical aliases", async () => fixture(async root => {
  const directory = join(root, "bundle"), alias = join(root, "alias");
  await mkdir(directory); await symlink(directory, alias, process.platform === "win32" ? "junction" : "dir");
  const owner = await claimSourceDocumentOwner(directory, "manual-session", async () => "actual snapshot");
  try {
    let writes = 0;
    for (const path of ["program.source.yaml", "quicker.source.json", ".qkrpc/baseline.json", "files/new/deep/script.cs"]) {
      await assert.rejects(withExternalSourceDocumentWrite(join(alias, path), async () => { writes++; }), { code: "SOURCE_DOCUMENT_OPEN" });
    }
    await assert.rejects(withExternalSourceDocumentWrite(alias, async () => { writes++; }, true), { code: "SOURCE_DOCUMENT_OPEN" });
    await assert.rejects(withExternalSourceDocumentWrite(root, async () => { writes++; }, true), { code: "SOURCE_DOCUMENT_OPEN" });
    await assert.rejects(withExternalSourceDocumentWrite(join(alias, "files"), async () => { writes++; }, true), { code: "SOURCE_DOCUMENT_OPEN" });
    await assert.rejects(withExternalSourceDocumentWrite(join(alias, ".qkrpc"), async () => { writes++; }, true), { code: "SOURCE_DOCUMENT_OPEN" });
    assert.equal(writes, 0);
    assert.equal(await withSourceDocumentOwner(alias, owner.token, async () => "same original owner"), "same original owner");
    assert.equal(await withExternalSourceDocumentWrite(join(directory, "notes.txt"), async () => "ordinary sibling"), "ordinary sibling");
    await assert.rejects(withSourceDocumentOwner(directory, "stale-token", async () => assert.fail("must not dispatch")), { code: "SOURCE_DOCUMENT_STALE" });
    await assert.rejects(claimSourceDocumentOwner(alias, "other-session", async () => assert.fail("must not inspect")), { code: "SOURCE_DOCUMENT_OPEN" });
  } finally { owner.release(); }
  assert.equal(await withExternalSourceDocumentWrite(join(directory, "program.source.yaml"), async () => "released"), "released");
}));
test("closing and reopening cannot accept old operations or let an old release clear the new owner", async () => fixture(async root => {
  const old = await claimSourceDocumentOwner(root, "first", async () => null);
  old.release();
  const current = await claimSourceDocumentOwner(root, "second", async () => null);
  old.release();
  try {
    await assert.rejects(withSourceDocumentOwner(root, old.token, async () => assert.fail("old owner ran")), { code: "SOURCE_DOCUMENT_STALE" });
    assert.equal(await withSourceDocumentOwner(root, current.token, async () => "current"), "current");
  } finally { current.release(); }
}));
test("a real owner operation finishes before a waiting replacement can inspect; failed inspect releases its claim", async () => fixture(async root => {
  await assert.rejects(claimSourceDocumentOwner(root, "failed", async () => { throw Error("inspect failed"); }), /inspect failed/);
  const old = await claimSourceDocumentOwner(root, "first", async () => null);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(done => { release = done; }), started = new Promise<void>(done => { entered = done; });
  const writing = withSourceDocumentOwner(root, old.token, async () => { entered(); await gate; return "confirmed old write"; });
  await started; old.release();
  let inspected = false;
  const replacing = claimSourceDocumentOwner(root, "replacement", async () => { inspected = true; return null; });
  await new Promise<void>(done => setImmediate(done)); assert.equal(inspected, false);
  release(); assert.equal(await writing, "confirmed old write");
  const replacement = await replacing; assert.equal(inspected, true); replacement.release();
}));

test("a cancelled ALS write queued behind a slow operation cannot run after the old owner releases", async () => fixture(async root => {
  const path = join(root, "program.source.yaml"); await writeFile(path, "before\n");
  const owner = await claimSourceDocumentOwner(root, "manual", async () => null);
  let release!: () => void, entered!: () => void, writes = 0;
  const gate = new Promise<void>(done => { release = done; }), started = new Promise<void>(done => { entered = done; });
  const slow = withSourceDocumentOwner(root, owner.token, async () => { entered(); await gate; }); await started;
  const parent = new AbortController();
  const queued = runWithAgentRequestContextAsync({ cwd: root, abortSignal: parent.signal }, () => withExternalSourceDocumentWrite(path, async () => { writes++; await writeFile(path, "must never land\n"); }));
  parent.abort(new Error("cancelled queued write")); owner.release(); release(); await slow;
  await assert.rejects(queued, /cancelled queued write/);
  assert.equal(writes, 0); assert.equal(await readFile(path, "utf8"), "before\n");
}));

test("nested resource bundles cannot acquire a second writing lease over the first document", async () => fixture(async root => {
  const outer = join(root, "A"), nested = join(outer, "files/nested"), sibling = join(root, "B"), ordinary = join(outer, "notes/independent");
  await mkdir(nested, { recursive: true }); await mkdir(sibling); await mkdir(ordinary, { recursive: true });
  const owner = await claimSourceDocumentOwner(outer, "A", async () => null); let inspections = 0;
  try {
    await assert.rejects(claimSourceDocumentOwner(nested, "nested", async () => { inspections++; }), { code: "SOURCE_DOCUMENT_OPEN" });
    assert.equal(inspections, 0);
    const other = await claimSourceDocumentOwner(sibling, "B", async () => null); other.release();
    const separate = await claimSourceDocumentOwner(ordinary, "notes", async () => null); separate.release();
  } finally { owner.release(); }
  const nestedOwner = await claimSourceDocumentOwner(nested, "nested-first", async () => null);
  try { await assert.rejects(claimSourceDocumentOwner(outer, "parent-later", async () => { inspections++; }), { code: "SOURCE_DOCUMENT_OPEN" }); }
  finally { nestedOwner.release(); }
}));

test("StrReplace cancelled during its second disk read cannot write through any matching strategy", async () => {
  for (const variant of [
    { text: "old old", oldString: "old", newString: "new", replaceAll: true },
    { text: "old", oldString: "old", newString: "new", replaceAll: false },
    { text: '{\n  "a": 1,\n  "b": 2\n}', oldString: '{"b":2,"a":1}', newString: '{"b":3,"a":1}', replaceAll: false },
  ]) await fixture(async root => {
    const path = "owned/files/value.json", absolute = join(root, path); await mkdir(join(root, "owned/files"), { recursive: true }); await writeFile(absolute, variant.text);
    let release!: () => void, entered!: () => void, reads = 0, writes = 0;
    const gate = new Promise<void>(done => { release = done; }), started = new Promise<void>(done => { entered = done; });
    const parent = new AbortController(), originalRead = fsPromises.readFile, originalWrite = fsPromises.writeFile;
    const read = mock.method(fsPromises, "readFile", (async (...args: Parameters<typeof fsPromises.readFile>) => {
      const result = await originalRead(...args);
      if (String(args[0]) === absolute && ++reads === 2) { entered(); await gate; }
      return result;
    }) as typeof fsPromises.readFile);
    const write = mock.method(fsPromises, "writeFile", (async (...args: Parameters<typeof fsPromises.writeFile>) => {
      if (String(args[0]) === absolute) writes++;
      return originalWrite(...args);
    }) as typeof fsPromises.writeFile);
    syncBuiltinESMExports();
    try {
      const editing = runWithAgentRequestContextAsync({ cwd: root, abortSignal: parent.signal }, () => executeWorkspaceFileTool({ action: "edit", path, ...variant }));
      await started; parent.abort(new Error("cancelled during second read")); release();
      await assert.rejects(editing, /cancelled during second read/); assert.equal(writes, 0);
    } finally { release?.(); read.mock.restore(); write.mock.restore(); syncBuiltinESMExports(); }
    assert.equal(await readFile(absolute, "utf8"), variant.text);
  });
});
