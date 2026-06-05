import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateShellPolicy, summarizeShellRequest } from "@/lib/shell-policy";
import { buildShellInvocation } from "@/lib/shell-runner";

describe("shell-policy", () => {
  it("allows read-only git status", () => {
    const verdict = evaluateShellPolicy({
      mode: "command",
      command: "git status -sb",
    });
    assert.equal(verdict.allowed, true);
    assert.equal(verdict.requiresApproval, false);
  });

  it("does not require approval for comparison operators", () => {
    const verdict = evaluateShellPolicy({
      mode: "command",
      command: "if ($count -gt 0) { Write-Output ok }",
    });
    assert.equal(verdict.allowed, true);
    assert.equal(verdict.requiresApproval, false);
  });

  it("requires approval for destructive remove-item", () => {
    const verdict = evaluateShellPolicy({
      mode: "command",
      command: "Remove-Item -Recurse .\\publish",
    });
    assert.equal(verdict.allowed, true);
    assert.equal(verdict.requiresApproval, true);
  });

  it("blocks disk format", () => {
    const verdict = evaluateShellPolicy({
      mode: "command",
      command: "format c: /q",
    });
    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason ?? "", /format/i);
  });

  it("summarizes script path", () => {
    assert.equal(
      summarizeShellRequest({
        mode: "scriptPath",
        scriptPath: "scripts/build.ps1",
      }),
      "scripts/build.ps1",
    );
  });
});

describe("buildShellInvocation", () => {
  it("builds powershell command invocation on win32", () => {
    if (process.platform !== "win32") return;
    const inv = buildShellInvocation("powershell", "Write-Output 1");
    assert.match(inv.executable.toLowerCase(), /pwsh|powershell/);
    assert.equal(inv.args.includes("-Command"), true);
    assert.equal(inv.args.at(-1), "Write-Output 1");
  });
});
