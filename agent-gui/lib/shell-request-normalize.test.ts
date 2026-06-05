import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeShellRunRequest,
  tryRewriteCommandToScriptPath,
} from "./shell-request-normalize";

describe("shell-request-normalize", () => {
  it("rewrites pwsh -File to scriptPath", () => {
    const rewritten = tryRewriteCommandToScriptPath(
      "pwsh -NoProfile -File ./build.ps1 -t",
    );
    assert.deepEqual(rewritten, {
      scriptPath: "./build.ps1",
      args: ["-t"],
    });
  });

  it("rewrites relative ps1 path", () => {
    const rewritten = tryRewriteCommandToScriptPath(".\\scripts\\test.ps1 arg1");
    assert.deepEqual(rewritten, {
      scriptPath: "./scripts/test.ps1",
      args: ["arg1"],
    });
  });

  it("leaves plain commands unchanged", () => {
    assert.equal(
      tryRewriteCommandToScriptPath("git status -sb"),
      null,
    );
    const normalized = normalizeShellRunRequest({
      mode: "command",
      command: "dotnet test QuickerRpc.Plugin.Test -c Release",
    });
    assert.equal(normalized.mode, "command");
    assert.equal(normalized.command, "dotnet test QuickerRpc.Plugin.Test -c Release");
  });
});
