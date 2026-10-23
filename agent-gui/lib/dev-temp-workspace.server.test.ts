import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { mkdir, readFile, rmdir, symlink, writeFile } from "node:fs/promises";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, mock, test } from "node:test";
import {
  assertDevTempWorkspacePath,
  cleanupDevTempWorkspace,
  createDevTempWorkspace,
  resolveDevTempWorkspaceRoot,
} from "@/lib/dev-temp-workspace.server";

const previousCwd = process.cwd();
const previousNodeEnv = process.env.NODE_ENV;
let sandboxRoot = "";

beforeEach(async () => {
  process.env.NODE_ENV = "development";
  sandboxRoot = mkdtempSync(join(tmpdir(), "qka-temp-ws-"));
  await mkdir(join(sandboxRoot, "benchmarks", "fixtures", "eval-workspace"), {
    recursive: true,
  });
  await mkdir(join(sandboxRoot, ".local"), { recursive: true });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    join(sandboxRoot, "benchmarks", "fixtures", "eval-workspace", "README.md"),
    "fixture",
    "utf8",
  );
  process.chdir(sandboxRoot);
});

afterEach(() => {
  process.chdir(previousCwd);
  if (previousNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = previousNodeEnv;
  }
  rmSync(sandboxRoot, { recursive: true, force: true });
});

describe("dev-temp-workspace.server", () => {
  test("managed roots accept native canonical names while retaining the selected lexical alias", () => {
    const selectedRoot = process.cwd();
    const canonicalRoot = join(sandboxRoot, "canonical-long-name");
    const native = mock.method(realpathSync, "native", (path) => {
      assert.equal(path, selectedRoot);
      return canonicalRoot;
    });
    try {
      const canonicalManagedRoot = join(canonicalRoot, ".local", "temp-workspaces");
      assert.equal(resolveDevTempWorkspaceRoot(), canonicalManagedRoot);
      const canonicalWorkspace = join(canonicalManagedRoot, "ws-canonical");
      assert.equal(assertDevTempWorkspacePath(canonicalWorkspace), canonicalWorkspace);
      const lexicalWorkspace = join(selectedRoot, ".local", "temp-workspaces", "ws-lexical");
      assert.equal(assertDevTempWorkspacePath(lexicalWorkspace), lexicalWorkspace);
      assert.throws(() => assertDevTempWorkspacePath(join(canonicalRoot, "outside", "ws-other")), /not under/);
    } finally {
      native.mock.restore();
    }
  });

  test("createDevTempWorkspace seeds eval fixture and cleanup removes it", async () => {
    const created = await createDevTempWorkspace({ seed: "eval-workspace" });
    assert.ok(created.path.startsWith(resolveDevTempWorkspaceRoot()));
    assert.equal(assertDevTempWorkspacePath(created.path), created.path);

    const readme = await readFile(
      join(created.path, "README.md"),
      "utf8",
    );
    assert.equal(readme, "fixture");

    const cleanup = await cleanupDevTempWorkspace(created.path);
    assert.equal(cleanup.path, created.path);
    assert.equal(cleanup.errors.length, 0);
    await assert.rejects(() => readFile(join(created.path, "README.md")));
  });

  test("assertDevTempWorkspacePath rejects paths outside temp root", () => {
    assert.throws(
      () => assertDevTempWorkspacePath(join(sandboxRoot, "benchmarks")),
      /not under dev temp-workspaces root|not a dev temp workspace/,
    );
  });

  test("copied host references never invoke RPC or spawn during local cleanup", async () => {
    const created = await createDevTempWorkspace({ seed: "empty" });
    for (const kind of ["actions", "subprograms"]) {
      const directory = join(created.path, ".quicker", kind, "copied-existing-program");
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "info.json"), JSON.stringify({
        id: "11111111-2222-4333-8444-555555555555", title: "Existing host content",
      }));
    }
    let requests = 0;
    const fetchSpy = mock.method(globalThis, "fetch", async () => { requests += 1; throw new Error("must not call host"); });
    const spawnSpy = mock.method(childProcess, "spawn", () => { requests += 1; throw new Error("must not spawn host CLI"); });
    syncBuiltinESMExports();
    try {
      const result = await cleanupDevTempWorkspace(created.path);
      assert.deepEqual(result.deletedActions, []);
      assert.deepEqual(result.deletedSubprograms, []);
      assert.equal(result.hostArtifactsPreserved, true);
      assert.equal(requests, 0);
      await assert.rejects(readFile(join(created.path, ".quicker", "actions", "copied-existing-program", "info.json")));
      assert.equal((await cleanupDevTempWorkspace(created.path)).hostArtifactsPreserved, true);
    } finally {
      fetchSpy.mock.restore();
      spawnSpy.mock.restore();
      syncBuiltinESMExports();
    }
  });

  test("a workspace junction cannot remove files outside the managed root", async () => {
    const outside = join(sandboxRoot, "keep-outside-temp-workspaces");
    await mkdir(outside);
    await writeFile(join(outside, "keep.txt"), "preserve");
    await mkdir(resolveDevTempWorkspaceRoot(), { recursive: true });
    const linked = join(resolveDevTempWorkspaceRoot(), "ws-linked");
    await symlink(outside, linked, process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(cleanupDevTempWorkspace(linked), /outside its managed root/);
    assert.equal(await readFile(join(outside, "keep.txt"), "utf8"), "preserve");
  });

  for (const redirected of ["root", "local"] as const) {
    test(`a redirected ${redirected} ancestor cannot create or remove outside files`, async () => {
      const outside = join(sandboxRoot, `preserve-${redirected}`);
      const workspace = join(outside, ...(redirected === "local" ? ["temp-workspaces"] : []), "ws-existing");
      await mkdir(workspace, { recursive: true });
      await writeFile(join(workspace, "keep.txt"), "preserve");
      const link = redirected === "local" ? join(sandboxRoot, ".local") : resolveDevTempWorkspaceRoot();
      if (redirected === "local") await rmdir(link);
      await symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
      await assert.rejects(cleanupDevTempWorkspace(join(resolveDevTempWorkspaceRoot(), "ws-existing")), /root path is redirected/);
      await assert.rejects(createDevTempWorkspace({ seed: "empty" }), /root path is redirected/);
      assert.equal(await readFile(join(workspace, "keep.txt"), "utf8"), "preserve");
    });
  }

  test("an application checkout alias still resolves to its own managed workspaces", async () => {
    const alias = join(sandboxRoot, "application-alias");
    await symlink(sandboxRoot, alias, process.platform === "win32" ? "junction" : "dir");
    process.chdir(alias);
    const created = await createDevTempWorkspace({ seed: "empty" });
    assert.equal(assertDevTempWorkspacePath(created.path), created.path);
    assert.equal((await cleanupDevTempWorkspace(created.path)).hostArtifactsPreserved, true);
  });
});
