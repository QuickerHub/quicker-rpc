import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, test } from "node:test";
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
});
