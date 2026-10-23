import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import test, { mock } from "node:test";
import { createTurnExecutionState, disposeTurnExecutionState } from "./agent-harness/turn-execution-state";
import {
  rememberActionSourceReadDirectory,
  validateConfirmedActionSourceRead,
  type ActionSourceReadDependencies,
} from "./action-source-read-guard";

const bundle = resolve("fixture-cwd/.tmp/source");
const lexical = (path: string) => ({ ok: true as const, absolute: path, relative: "fixture" });
function metadataFixture(overrides: Partial<ActionSourceReadDependencies> = {}) {
  const inspected: string[] = [];
  const dependencies: ActionSourceReadDependencies = {
    resolveDirectory: async (directory) => { inspected.push(directory); return lexical(directory); },
    lstat: async (path) => { inspected.push(path); return { isFile: () => true, isSymbolicLink: () => false }; },
    realpath: async (path) => { inspected.push(path); return path; },
    ...overrides,
  };
  return { dependencies, inspected };
}

test("confirmed roots allow only source YAML and resource files using metadata-only ports", async () => {
  const state = createTurnExecutionState();
  rememberActionSourceReadDirectory(state, bundle);
  rememberActionSourceReadDirectory(state, join(bundle, "child", ".."));
  assert.equal(state.actionSourceDirectories?.size, 1);
  const fixture = metadataFixture();
  for (const suffix of ["program.source.yaml", "files/script.cs", "files/nested/form.html"]) {
    const path = join(bundle, suffix);
    assert.equal(await validateConfirmedActionSourceRead(state, lexical(path), fixture.dependencies), true);
  }
  assert.equal(fixture.inspected.length, 9);
});

test("native canonical proof handles a short-name alias without trusting later redirection", async () => {
  const state = createTurnExecutionState();
  const shortBundle = resolve("fixture-cwd/SHORT~1/.tmp/source");
  const canonicalBundle = resolve("fixture-cwd/canonical long name/.tmp/source");
  const native = mock.method(realpathSync, "native", (path) => {
    assert.equal(path, shortBundle);
    return canonicalBundle;
  });
  try {
    rememberActionSourceReadDirectory(state, shortBundle);
  } finally {
    native.mock.restore();
  }
  const canonicalize = (path: string) => join(canonicalBundle, relative(shortBundle, path));
  const fixture = metadataFixture({
    resolveDirectory: async (directory) => lexical(canonicalize(directory)),
    realpath: async (path) => canonicalize(path),
  });
  for (const suffix of ["program.source.yaml", "files/script.cs"]) {
    assert.equal(await validateConfirmedActionSourceRead(state, lexical(join(shortBundle, suffix)), fixture.dependencies), true);
  }

  let metadataCalls = 0;
  const redirected = metadataFixture({
    resolveDirectory: async () => lexical(resolve("outside-root/files")),
    lstat: async () => { metadataCalls += 1; return { isFile: () => true, isSymbolicLink: () => false }; },
  });
  assert.equal(await validateConfirmedActionSourceRead(state, lexical(join(shortBundle, "files/script.cs")), redirected.dependencies), false);
  assert.equal(metadataCalls, 0);
});

test("no proof or unrelated/managed paths cannot create a broad Read exception", async () => {
  const state = createTurnExecutionState();
  const fixture = metadataFixture();
  assert.equal(await validateConfirmedActionSourceRead(state, lexical(join(bundle, "program.source.yaml")), fixture.dependencies), false);
  rememberActionSourceReadDirectory(state, bundle);
  for (const path of [
    join(bundle, "quicker.source.json"), join(bundle, ".qkrpc/baseline.json"), join(bundle, "README.md"),
    join(bundle, "files-neighbor/script.cs"), join(bundle, "../source-neighbor/program.source.yaml"),
    join(bundle, "files/../../outside/program.source.yaml"),
  ]) assert.equal(await validateConfirmedActionSourceRead(state, lexical(path), fixture.dependencies), false);
  assert.equal(fixture.inspected.filter((path) => path.endsWith("baseline.json") || path.endsWith("quicker.source.json")).length, 0);
});

test("canonical parent resolution prevents redirected resources from escaping their proven bundle", async () => {
  const state = createTurnExecutionState();
  rememberActionSourceReadDirectory(state, bundle);
  let fileMetadataCalls = 0;
  const fixture = metadataFixture({
    resolveDirectory: async () => lexical(resolve("outside-root/files")),
    lstat: async () => { fileMetadataCalls += 1; return { isFile: () => true, isSymbolicLink: () => false }; },
  });
  assert.equal(await validateConfirmedActionSourceRead(state, lexical(join(bundle, "files/script.cs")), fixture.dependencies), false);
  assert.equal(fileMetadataCalls, 0);
});

test("a logical directory alias can only read files that resolve to the proven canonical root", async () => {
  const state = createTurnExecutionState();
  rememberActionSourceReadDirectory(state, bundle);
  const logical = resolve("fixture-cwd/alias/program.source.yaml");
  const canonical = join(bundle, "program.source.yaml");
  const fixture = metadataFixture({
    resolveDirectory: async () => lexical(bundle),
    realpath: async () => canonical,
  });
  assert.equal(await validateConfirmedActionSourceRead(state, lexical(logical), fixture.dependencies), true);
});

test("linked files and changed canonical targets do not inherit the source Read exception", async () => {
  const state = createTurnExecutionState();
  rememberActionSourceReadDirectory(state, bundle);
  const path = join(bundle, "files/script.cs");
  const linked = metadataFixture({ lstat: async () => ({ isFile: () => true, isSymbolicLink: () => true }) });
  assert.equal(await validateConfirmedActionSourceRead(state, lexical(path), linked.dependencies), false);
  const redirected = metadataFixture({ realpath: async () => resolve("outside-root/script.cs") });
  assert.equal(await validateConfirmedActionSourceRead(state, lexical(path), redirected.dependencies), false);
});

test("proof is scoped to the owner and absolute cwd, and disposal prevents late registration", async () => {
  const first = createTurnExecutionState();
  const second = createTurnExecutionState();
  rememberActionSourceReadDirectory(first, bundle);
  rememberActionSourceReadDirectory(second, resolve("another-cwd/.tmp/source"));
  const path = lexical(join(bundle, "program.source.yaml"));
  const fixture = metadataFixture();
  assert.equal(await validateConfirmedActionSourceRead(first, path, fixture.dependencies), true);
  assert.equal(await validateConfirmedActionSourceRead(second, path, fixture.dependencies), false);
  disposeTurnExecutionState(first);
  rememberActionSourceReadDirectory(first, bundle);
  rememberActionSourceReadDirectory(undefined, bundle);
  assert.deepEqual(first, { closed: true });
  assert.equal(await validateConfirmedActionSourceRead(first, path, fixture.dependencies), false);
});

test("cancellation is preserved before metadata and during directory validation", async () => {
  const state = createTurnExecutionState();
  rememberActionSourceReadDirectory(state, bundle);
  const parent = new AbortController();
  const reason = new Error("stop source read");
  const fixture = metadataFixture({ resolveDirectory: async (directory) => {
    parent.abort(reason);
    return lexical(directory);
  } });
  const path = lexical(join(bundle, "program.source.yaml"));
  await assert.rejects(validateConfirmedActionSourceRead(state, path, fixture.dependencies, parent.signal), (error: unknown) => error === reason);
  await assert.rejects(validateConfirmedActionSourceRead(state, path, fixture.dependencies, parent.signal), (error: unknown) => error === reason);
  assert.deepEqual(fixture.inspected, []);
});

test("unavailable metadata fails closed without consuming file contents", async () => {
  const state = createTurnExecutionState();
  rememberActionSourceReadDirectory(state, bundle);
  const path = join(bundle, "program.source.yaml");
  const fixture = metadataFixture({ realpath: async () => { throw new Error("synthetic unavailable path"); } });
  assert.equal(await validateConfirmedActionSourceRead(state, lexical(path), fixture.dependencies), false);
  assert.equal(fixture.inspected[0], dirname(path));
});
