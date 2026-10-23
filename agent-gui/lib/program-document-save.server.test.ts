import assert from "node:assert/strict";
import { link, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { fingerprintProgramDocumentContent } from "./action-editor/document/programDocumentWire";
import { createProgramDocumentSession } from "./action-editor/document/programDocumentSession";
import { patchProgramDocumentMetadata } from "./action-editor/document/programDocumentMetadata";
import { saveProgramDocument, withProgramDocumentWriteOwner } from "./program-document-save.server";
import { runWithQkrpcCwdAsync } from "./qkrpc-request-context";
import { resolveWorkspaceRoot, writeWorkspaceFile } from "./workspace-fs";
import { MAX_UI_READ_BYTES } from "./workspace-file-helpers";

const path = ".quicker/actions/fixture/data.json";
const infoPath = ".quicker/actions/fixture/info.json";
const initialBody = JSON.stringify({ steps: [], variables: [], subPrograms: [], future: { revision: 1 } });
const changedBody = JSON.stringify({ steps: [], variables: [], subPrograms: [], future: { revision: 2 } });
const initialMetadata = '{"ID":"fixture","EditVersion":9223372036854775807,"Title":"Before","Future":{"number":9007199254740993}}';
const changedMetadata = patchProgramDocumentMetadata(initialMetadata, { title: "After" });

async function fixture(run: (root: string, outer: string) => Promise<void>) {
  const tempRoot = await realpath(tmpdir());
  const outer = await mkdtemp(join(tempRoot, "qkrpc-document-save-"));
  const root = join(outer, "workspace");
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), initialBody);
  await writeFile(join(root, infoPath), initialMetadata);
  try { await runWithQkrpcCwdAsync(root, () => run(root, outer)); }
  finally {
    const actual = await realpath(outer);
    assert.equal(dirname(actual), tempRoot);
    assert.ok(relative(tempRoot, actual).startsWith("qkrpc-document-save-"));
    await rm(actual, { recursive: true, force: true });
  }
}

function request() {
  return { path, content: changedBody, expectedContent: initialBody, expectedProjectBinding: null,
    metadata: { content: changedMetadata, expectedContent: initialMetadata } };
}

test("saves an existing body and presentation metadata through the real workspace normalizer", async () => fixture(async (root) => {
  assert.deepEqual(await saveProgramDocument(request()), { ok: true });
  const body = await readFile(join(root, path), "utf8");
  assert.equal(fingerprintProgramDocumentContent(body), fingerprintProgramDocumentContent(changedBody));
  assert.equal(await readFile(join(root, infoPath), "utf8"), changedMetadata);
  assert.match(await readFile(join(root, infoPath), "utf8"), /9223372036854775807/);
  assert.match(await readFile(join(root, infoPath), "utf8"), /9007199254740993/);
  assert.deepEqual(await saveProgramDocument({ path, content: body, expectedContent: body, expectedProjectBinding: null, metadata: { content: changedMetadata, expectedContent: changedMetadata } }, {
    writeWorkspaceFile: async () => { throw new Error("Unchanged parts must not be written"); },
  }), { ok: true });
  const next = JSON.stringify({ steps: [], variables: [], subPrograms: [], future: { revision: 3 } });
  assert.deepEqual(await saveProgramDocument({ path, content: next, expectedContent: body, expectedProjectBinding: null }), { ok: true });
  assert.equal(fingerprintProgramDocumentContent(await readFile(join(root, path), "utf8")), fingerprintProgramDocumentContent(next));
}));

test("a real document ticket preserves opaque Int64s through both-file saving and distinguishes numeric CAS conflicts", async () => fixture(async (root) => {
  const native = JSON.stringify({
    futureMain: "__int64__", steps: [{ stepId: "step", stepRunnerKey: "future:branch", note: "before", futureStep: "__int64__",
      inputParams: { extension: { value: "value", futureInput: "__int64__" }, "script.file": "files/script.cs" },
      ifSteps: [{ stepId: "child", stepRunnerKey: "future:child", futureBranch: "__int64__", inputParams: {} }],
    }], variables: [{ id: "v", key: "value", futureVariable: "__int64__", inputParamInfo: { futureInfo: "__int64__" } }],
    subPrograms: [{ id: "sub", name: "Sub", futureSub: "__int64__", steps: [], variables: [], subPrograms: [] }],
  }).replaceAll('"__int64__"', "9223372036854775807");
  await writeFile(join(root, path), native);
  const files = join(root, ".quicker/actions/fixture/files");
  await mkdir(files);
  await writeFile(join(files, "script.cs"), "// fixture reference\n");
  const session = createProgramDocumentSession({ content: native, identity: { documentKey: path, storage: { key: path } }, metadata: { path: infoPath, content: initialMetadata } });
  try {
    const edited = session.applyMetadata({ title: "After" }, { expectedRevision: 0, source: "ui" });
    assert.equal(edited.ok, true);
    const snapshot = session.readSnapshot();
    snapshot.steps[0]!.note = "after";
    const started = session.beginSave(() => snapshot);
    if (!started.ok) assert.fail(started.error);
    const ticket = started.ticket;
    const result = await saveProgramDocument({ path, content: ticket.content, expectedContent: ticket.baselineContent, expectedProjectBinding: null,
      metadata: { content: ticket.metadata!.content, expectedContent: ticket.metadata!.baselineContent } });
    assert.deepEqual(result, { ok: true });
    session.completeSave(ticket, result);
    const disk = await readFile(join(root, path), "utf8");
    for (const key of ["futureMain", "futureStep", "futureInput", "futureBranch", "futureVariable", "futureInfo", "futureSub"]) assert.match(disk, new RegExp(`"${key}":\\s*9223372036854775807`));
    assert.equal(JSON.parse(disk).steps[0].note, "after");
    assert.equal(JSON.parse(disk).steps[0].inputParams["script.file"], "files/script.cs");
    assert.equal(await readFile(join(files, "script.cs"), "utf8"), "// fixture reference\n");
    const metadata = await readFile(join(root, infoPath), "utf8");
    assert.match(metadata, /"EditVersion":9223372036854775807/);
    assert.match(metadata, /"number":9007199254740993/);
    const external = disk.replace(/("futureMain":\s*)9223372036854775807/, (_match, prefix: string) => `${prefix}9223372036854775806`);
    assert.notEqual(external, disk);
    await writeFile(join(root, path), external);
    const conflict = await saveProgramDocument({ path, content: disk, expectedContent: disk, expectedProjectBinding: null, metadata: { content: metadata, expectedContent: metadata } });
    assert.equal(conflict.ok, false);
    if (!conflict.ok) { assert.equal(conflict.code, "body_conflict"); assert.equal(conflict.persistedParts, undefined); }
    assert.equal(await readFile(join(root, path), "utf8"), external);
  } finally { session.close(); }
}));

test("either initial baseline conflict prevents both writes", async () => fixture(async (root) => {
  const writes: string[] = [];
  const deps = { writeWorkspaceFile: async (...args: Parameters<typeof writeWorkspaceFile>) => { writes.push(args[0]); return writeWorkspaceFile(...args); } };
  await writeFile(join(root, path), changedBody);
  const bodyConflict = await saveProgramDocument(request(), deps);
  assert.equal(bodyConflict.ok, false);
  if (!bodyConflict.ok) { assert.equal(bodyConflict.code, "body_conflict"); assert.equal(bodyConflict.persistedParts, undefined); }
  await writeFile(join(root, path), initialBody);
  await writeFile(join(root, infoPath), changedMetadata);
  const metadataConflict = await saveProgramDocument(request(), deps);
  assert.equal(metadataConflict.ok, false);
  if (!metadataConflict.ok) { assert.equal(metadataConflict.code, "metadata_conflict"); assert.equal(metadataConflict.persistedParts, undefined); }
  assert.deepEqual(writes, []);
  assert.equal(await readFile(join(root, path), "utf8"), initialBody);
}));

test("concurrent saves and info stamps share the same owner and release it after rejection", async () => fixture(async (root) => {
  let started!: () => void;
  let finish!: () => void;
  const entered = new Promise<void>((resolveEntered) => { started = resolveEntered; });
  const gate = new Promise<void>((resolveGate) => { finish = resolveGate; });
  const writes: string[] = [];
  const first = saveProgramDocument(request(), { writeWorkspaceFile: async (...args) => {
    writes.push(args[0]);
    if (args[0] === path) { started(); await gate; }
    return writeWorkspaceFile(...args);
  } });
  await entered;
  const second = saveProgramDocument(request(), { writeWorkspaceFile: async (...args) => { writes.push(args[0]); return writeWorkspaceFile(...args); } });
  let stampEntered = false;
  const stamp = withProgramDocumentWriteOwner(infoPath, async () => { stampEntered = true; });
  await new Promise<void>((done) => setImmediate(done));
  assert.equal(stampEntered, false);
  finish();
  assert.deepEqual(await first, { ok: true });
  const conflict = await second;
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.code, "body_conflict");
  await stamp;
  assert.deepEqual(writes, [path, infoPath]);
  await assert.rejects(withProgramDocumentWriteOwner(path, async () => { throw new Error("fixture failure"); }), /fixture failure/);
  assert.equal(await withProgramDocumentWriteOwner(path, async () => "released"), "released");
  assert.equal(fingerprintProgramDocumentContent(await readFile(join(root, path), "utf8")), fingerprintProgramDocumentContent(changedBody));
}));

test("reports a persisted body after metadata failure and retries only the remaining part", async () => fixture(async (root) => {
  const writes: string[] = [];
  const result = await saveProgramDocument(request(), { writeWorkspaceFile: async (...args) => {
    writes.push(args[0]);
    if (args[0] === infoPath) throw new Error("fixture metadata write failure");
    return writeWorkspaceFile(...args);
  } });
  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual(result.persistedParts, { body: true });
  const persistedBody = await readFile(join(root, path), "utf8");
  assert.equal(fingerprintProgramDocumentContent(persistedBody), fingerprintProgramDocumentContent(changedBody));
  assert.equal(await readFile(join(root, infoPath), "utf8"), initialMetadata);
  writes.length = 0;
  assert.deepEqual(await saveProgramDocument({ ...request(), expectedContent: persistedBody }, { writeWorkspaceFile: async (...args) => { writes.push(args[0]); return writeWorkspaceFile(...args); } }), { ok: true });
  assert.deepEqual(writes, [infoPath]);
}));

test("a failed first write does not attempt metadata or claim known persistence", async () => fixture(async (root) => {
  const writes: string[] = [];
  const result = await saveProgramDocument(request(), { writeWorkspaceFile: async (path) => { writes.push(path); throw new Error("fixture body write failure"); } });
  assert.equal(result.ok, false);
  if (!result.ok) { assert.equal(result.code, "write_failed"); assert.equal(result.persistedParts, undefined); }
  assert.deepEqual(writes, [path]);
  assert.equal(await readFile(join(root, path), "utf8"), initialBody);
  assert.equal(await readFile(join(root, infoPath), "utf8"), initialMetadata);
}));

test("a metadata change during body persistence is reported without rolling back the body", async () => fixture(async (root) => {
  const result = await saveProgramDocument(request(), { writeWorkspaceFile: async (...args) => {
    const written = await writeWorkspaceFile(...args);
    if (args[0] === path) await writeFile(join(root, infoPath), patchProgramDocumentMetadata(initialMetadata, { title: "Other writer" }));
    return written;
  } });
  assert.equal(result.ok, false);
  if (!result.ok) { assert.equal(result.code, "metadata_conflict"); assert.deepEqual(result.persistedParts, { body: true }); }
  assert.match(await readFile(join(root, infoPath), "utf8"), /Other writer/);
  assert.equal(fingerprintProgramDocumentContent(await readFile(join(root, path), "utf8")), fingerprintProgramDocumentContent(changedBody));
}));

test("metadata cannot alter identity, version, opaque fields or aliases", async () => fixture(async (root) => {
  for (const content of [changedMetadata.replace('"fixture"', '"other"'), changedMetadata.replace("9223372036854775807", "9223372036854775806"), changedMetadata.replace("9007199254740993", "9007199254740992"), changedMetadata.replace('"ID"', '"id"')]) {
    const result = await saveProgramDocument({ ...request(), metadata: { content, expectedContent: initialMetadata } });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "metadata_not_editable");
  }
  assert.equal(await readFile(join(root, path), "utf8"), initialBody);
  assert.equal(await readFile(join(root, infoPath), "utf8"), initialMetadata);
}));

test("existing body-only global and embedded subprograms are supported; their metadata is rejected", async () => fixture(async (root) => {
  for (const target of [".quicker/subprograms/global/data.json", ".quicker/actions/fixture/subprograms/embedded/data.json"]) {
    await mkdir(dirname(join(root, target)), { recursive: true });
    await writeFile(join(root, target), initialBody);
    const invalid = await saveProgramDocument({ ...request(), path: target });
    assert.equal(invalid.ok, false);
    assert.equal(await readFile(join(root, target), "utf8"), initialBody);
    assert.deepEqual(await saveProgramDocument({ path: target, content: changedBody, expectedContent: initialBody }), { ok: true });
  }
}));

test("payload, size, missing files, traversal and ADS fail without writing", async () => fixture(async (root) => {
  let writes = 0;
  const deps = { writeWorkspaceFile: async (...args: Parameters<typeof writeWorkspaceFile>) => { writes++; return writeWorkspaceFile(...args); } };
  for (const value of [null, {}, { ...request(), content: 3 }, { ...request(), expectedContent: null }, { ...request(), metadata: [] }, { ...request(), content: " ".repeat(MAX_UI_READ_BYTES + 1) }, { ...request(), path: "../outside/data.json" }, { ...request(), path: `${path}:stream` }, { ...request(), path: ".quicker/actions/missing/data.json" }, { ...request(), path: ".quicker/actions/fixture/info.json" }]) {
    const result = await saveProgramDocument(value, deps);
    assert.equal(result.ok, false);
  }
  assert.equal(writes, 0);
  assert.equal(await readFile(join(root, path), "utf8"), initialBody);
}));

test("directory redirects and hardlinked files are rejected before content writes", async () => fixture(async (root, outer) => {
  const elsewhere = join(outer, "elsewhere");
  await mkdir(elsewhere);
  await writeFile(join(elsewhere, "data.json"), initialBody);
  await symlink(elsewhere, join(root, ".quicker/actions/redirect"), "junction");
  const redirect = await saveProgramDocument({ path: ".quicker/actions/redirect/data.json", content: changedBody, expectedContent: initialBody });
  assert.equal(redirect.ok, false);
  if (!redirect.ok) assert.equal(redirect.code, "unsafe_path");
  const hardlinkedPath = ".quicker/actions/hardlinked/data.json";
  await mkdir(dirname(join(root, hardlinkedPath)));
  await link(join(elsewhere, "data.json"), join(root, hardlinkedPath));
  const hardlinked = await saveProgramDocument({ path: hardlinkedPath, content: changedBody, expectedContent: initialBody });
  assert.equal(hardlinked.ok, false);
  if (!hardlinked.ok) assert.equal(hardlinked.code, "unsafe_path");
  assert.equal(await readFile(join(elsewhere, "data.json"), "utf8"), initialBody);
}));

test("selected workspace aliases share a single document queue", async () => fixture(async (root, outer) => {
  const alias = join(outer, "workspace-alias");
  await symlink(root, alias, "junction");
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((done) => { release = done; });
  const entered = new Promise<void>((done) => { started = done; });
  const first = withProgramDocumentWriteOwner(path, async () => { started(); await gate; });
  await entered;
  let secondEntered = false;
  const second = runWithQkrpcCwdAsync(alias, () => withProgramDocumentWriteOwner(infoPath, async () => { secondEntered = true; assert.equal(resolveWorkspaceRoot(), resolve(root)); }));
  await new Promise<void>((done) => setImmediate(done));
  assert.equal(secondEntered, false);
  release();
  await Promise.all([first, second]);
  assert.equal(secondEntered, true);
}));
