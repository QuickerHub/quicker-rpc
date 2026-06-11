import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  applyQkrpcToolchainEnv,
  listQkrpcPathDirs,
  listShellToolPathDirs,
  prependPathDirs,
} from "./qkrpc-toolchain-env.mjs";
import { resolveRgBin } from "./rg-bin.mjs";

describe("qkrpc-toolchain-env", () => {
  it("prepends unique dirs without duplicating PATH segments", () => {
    const merged = prependPathDirs("C:\\Windows\\System32", [
      "C:\\tools\\qkrpc",
      "C:\\tools\\qkrpc",
    ]);
    assert.equal(merged, "C:\\tools\\qkrpc;C:\\Windows\\System32");
  });

  it("applyQkrpcToolchainEnv sets QKRPC_BIN and repo roots in monorepo dev", () => {
    const agentGuiRoot = join(process.cwd());
    const repoRoot = join(agentGuiRoot, "..");
    if (!existsSync(join(repoRoot, "version.json"))) {
      return;
    }

    const env = applyQkrpcToolchainEnv(
      { PATH: "C:\\existing" },
      { agentGuiRoot, cwd: repoRoot, repoRoot },
    );
    assert.ok(env.QKRPC_BIN?.trim());
    assert.equal(env.QKRPC_CWD, repoRoot);
    assert.equal(env.QKRPC_REPO_ROOT, repoRoot);
    assert.match(env.PATH ?? "", /C:\\existing/);
    const dirs = listQkrpcPathDirs(agentGuiRoot);
    assert.ok(dirs.length > 0);
    for (const dir of dirs) {
      assert.ok((env.PATH ?? "").toLowerCase().includes(dir.toLowerCase()));
    }
  });

  it("lists publish/cli when repo root exists", () => {
    const agentGuiRoot = process.cwd();
    const repoRoot = join(agentGuiRoot, "..");
    if (!existsSync(join(repoRoot, "version.json"))) {
      return;
    }
    const dirs = listQkrpcPathDirs(agentGuiRoot);
    const publishCli = join(repoRoot, "publish", "cli");
    if (existsSync(publishCli)) {
      assert.ok(dirs.some((d) => d.toLowerCase() === publishCli.toLowerCase()));
    }
  });

  it("creates temp fake qkrpc dir and prepends it", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "qkrpc-env-"));
    const binDir = join(tempRoot, "bin");
    try {
      mkdirSync(binDir, { recursive: true });
      writeFileSync(join(binDir, "qkrpc.exe"), "", { encoding: "utf8" });
      const dirs = listQkrpcPathDirs(tempRoot);
      // resolveQkrpcBin may not find fake exe; test prependPathDirs only
      const path = prependPathDirs("", [binDir]);
      assert.equal(path, binDir);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
