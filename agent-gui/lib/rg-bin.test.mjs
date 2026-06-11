import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  listBundledRgSourceDirs,
  listRgPathDirs,
  resolveRgBin,
} from "./rg-bin.mjs";
import {
  applyQkrpcToolchainEnv,
  listShellToolPathDirs,
} from "./qkrpc-toolchain-env.mjs";

describe("rg-bin", () => {
  it("lists bundled rg source dirs under agent-gui", () => {
    const agentGuiRoot = process.cwd();
    const dirs = listBundledRgSourceDirs(agentGuiRoot);
    assert.ok(dirs.length >= 2);
    assert.ok(dirs.some((d) => d.endsWith(".runtime\\rg") || d.endsWith(".runtime/rg")));
  });

  it("resolves staged fake rg and prepends its dir", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "rg-env-"));
    const rgDir = join(tempRoot, ".runtime", "rg");
    try {
      mkdirSync(rgDir, { recursive: true });
      writeFileSync(join(rgDir, "rg.exe"), "", { encoding: "utf8" });
      const bin = resolveRgBin(tempRoot);
      assert.equal(bin, join(rgDir, "rg.exe"));
      const dirs = listRgPathDirs(tempRoot);
      assert.deepEqual(dirs, [rgDir]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("resolveRgBin finds rg on dev machine when present", () => {
    const bin = resolveRgBin(process.cwd());
    if (!bin) {
      return;
    }
    assert.ok(existsSync(bin));
    assert.match(bin.toLowerCase(), /rg(\.exe)?$/);
  });
});

describe("qkrpc-toolchain-env rg integration", () => {
  it("applyQkrpcToolchainEnv sets RG_BIN when rg is available", () => {
    const agentGuiRoot = process.cwd();
    const rgBin = resolveRgBin(agentGuiRoot);
    if (!rgBin) {
      return;
    }

    const env = applyQkrpcToolchainEnv({ PATH: "C:\\existing" }, { agentGuiRoot });
    assert.equal(env.RG_BIN, rgBin);
    assert.ok((env.PATH ?? "").toLowerCase().includes(dirnameLower(rgBin)));
  });

  it("listShellToolPathDirs includes qkrpc and rg dirs", () => {
    const agentGuiRoot = process.cwd();
    const dirs = listShellToolPathDirs(agentGuiRoot);
    const rgDirs = listRgPathDirs(agentGuiRoot);
    for (const dir of rgDirs) {
      assert.ok(dirs.some((d) => d.toLowerCase() === dir.toLowerCase()));
    }
  });
});

function dirnameLower(filePath) {
  const sep = filePath.includes("\\") ? "\\" : "/";
  const idx = filePath.lastIndexOf(sep);
  return idx >= 0 ? filePath.slice(0, idx).toLowerCase() : filePath.toLowerCase();
}
