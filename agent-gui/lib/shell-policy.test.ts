import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateShellPolicy,
  formatShellApprovalCommand,
  summarizeShellRequest,
} from "@/lib/shell-policy";
import { buildShellInvocation } from "@/lib/shell-runner";

describe("shell-policy", () => {
  const workspaceRoot = "D:\\bench\\ws-f0aebfc8";

  it("allows read-only git status", () => {
    const verdict = evaluateShellPolicy({
      mode: "command",
      command: "git status -sb",
    });
    assert.equal(verdict.allowed, true);
    assert.equal(verdict.requiresApproval, false);
  });

  it("blocks qkrpc ping/serve and connectivity probes via shell", () => {
    assert.equal(
      evaluateShellPolicy({
        mode: "command",
        command: "qkrpc ping --json",
      }).allowed,
      false,
    );
    assert.equal(
      evaluateShellPolicy({
        mode: "command",
        command: "qkrpc wait --timeout 30 --json",
      }).allowed,
      false,
    );
    assert.equal(
      evaluateShellPolicy({
        mode: "command",
        command: "qkrpc serve --port 9477",
      }).allowed,
      false,
    );
    assert.equal(
      evaluateShellPolicy({
        mode: "command",
        command: "Invoke-RestMethod http://127.0.0.1:9477/health",
      }).allowed,
      false,
    );
    assert.equal(
      evaluateShellPolicy({
        mode: "command",
        command: "pwsh -NoProfile -File ./build.ps1 -t",
      }).allowed,
      false,
    );
  });

  it("allows read-only qkrpc CLI when PATH is injected by shell runner", () => {
    assert.equal(
      evaluateShellPolicy({
        mode: "command",
        command: "qkrpc action list --limit 1 --json",
      }).requiresApproval,
      false,
    );
  });

  it("allows dotnet build without approval", () => {
    assert.equal(
      evaluateShellPolicy({
        mode: "command",
        command: "dotnet build QuickerRpc.Plugin -c Release",
      }).requiresApproval,
      false,
    );
  });

  it("allows rg search without approval", () => {
    assert.equal(
      evaluateShellPolicy({
        mode: "command",
        command: "rg -n \"resolveRgBin\" --glob \"*.mjs\"",
      }).requiresApproval,
      false,
    );
  });

  it("allows pwsh build script launcher without approval", () => {
    const verdict = evaluateShellPolicy({
      mode: "command",
      command: "pwsh -NoProfile -File ./build.ps1 -Configuration Release",
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

  it("does not require approval for copy or process stop helpers", () => {
    assert.equal(
      evaluateShellPolicy({
        mode: "command",
        command: "Copy-Item .\\a.txt .\\b.txt",
      }).requiresApproval,
      false,
    );
    assert.equal(
      evaluateShellPolicy({
        mode: "command",
        command: "Stop-Process -Id 1234 -Force",
      }).requiresApproval,
      false,
    );
  });

  it("requires approval for destructive remove-item", () => {
    const verdict = evaluateShellPolicy({
      mode: "command",
      command: "Remove-Item -Recurse .\\publish",
    }, { workspaceRoot });
    assert.equal(verdict.allowed, true);
    assert.equal(verdict.requiresApproval, true);
  });

  it("auto-trusts workspace-local file writes", () => {
    assert.equal(
      evaluateShellPolicy({
        mode: "command",
        command: "Set-Content .\\out.txt 'hello'",
      }, { workspaceRoot }).requiresApproval,
      false,
    );
    assert.equal(
      evaluateShellPolicy({
        mode: "command",
        command: "Move-Item .\\a .\\b",
      }, { workspaceRoot }).requiresApproval,
      false,
    );
    assert.equal(
      evaluateShellPolicy({
        mode: "command",
        command: "git commit -m test",
      }, { workspaceRoot }).requiresApproval,
      false,
    );
  });

  it("requires approval for workspace writes without workspace root", () => {
    assert.equal(
      evaluateShellPolicy({
        mode: "command",
        command: "Set-Content D:\\outside\\out.txt 'hello'",
      }).requiresApproval,
      true,
    );
  });

  it("auto-trusts workspace-local mild delete", () => {
    assert.equal(
      evaluateShellPolicy({
        mode: "command",
        command: "Remove-Item .\\tmp.txt",
      }, { workspaceRoot }).requiresApproval,
      false,
    );
  });

  it("requires approval for file writes outside workspace scope", () => {
    assert.equal(
      evaluateShellPolicy({
        mode: "command",
        command: "Set-Content C:\\Windows\\Temp\\out.txt 'hello'",
      }, { workspaceRoot }).requiresApproval,
      true,
    );
    assert.equal(
      evaluateShellPolicy({
        mode: "command",
        command: "Set-Content C:\\Windows\\Temp\\out.txt 'hello'",
      }).requiresApproval,
      true,
    );
  });

  it("requires approval when pwsh wraps a destructive command", () => {
    const verdict = evaluateShellPolicy({
      mode: "command",
      command: 'pwsh -Command "Remove-Item .\\tmp -Recurse -Force"',
    }, { workspaceRoot });
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

  it("formats full shell approval command bodies", () => {
    assert.equal(
      formatShellApprovalCommand({
        command: "git status -sb",
      }),
      "git status -sb",
    );
    assert.equal(
      formatShellApprovalCommand({
        script: "Write-Output 1\nWrite-Output 2",
      }),
      "Write-Output 1\nWrite-Output 2",
    );
    assert.equal(
      formatShellApprovalCommand({
        scriptPath: "scripts/build.ps1",
        args: ["-t"],
      }),
      "scripts/build.ps1 -t",
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
