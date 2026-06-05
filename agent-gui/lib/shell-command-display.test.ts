import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveShellCommandDisplay,
  shouldUseStructuredShellCommand,
} from "./shell-command-display";

describe("resolveShellCommandDisplay", () => {
  it("splits pwsh -Command into invocation prefix and PowerShell script", () => {
    const parts = resolveShellCommandDisplay(
      "pwsh -Command Get-Location | Select-Object -ExpandProperty Path",
    );
    assert.equal(parts.invocationPrefix, "pwsh -Command ");
    assert.equal(
      parts.scriptText,
      "Get-Location | Select-Object -ExpandProperty Path",
    );
    assert.equal(parts.highlightLanguage, "powershell");
    assert.equal(shouldUseStructuredShellCommand(parts), true);
  });

  it("keeps bare commands on terminal highlighting by default", () => {
    const parts = resolveShellCommandDisplay("git --version");
    assert.equal(parts.invocationPrefix, "");
    assert.equal(parts.scriptText, "git --version");
    assert.equal(parts.highlightLanguage, "terminal");
    assert.equal(shouldUseStructuredShellCommand(parts), false);
  });

  it("uses shell hint when invocation wrapper is absent", () => {
    const parts = resolveShellCommandDisplay("Write-Output ok", "powershell");
    assert.equal(parts.highlightLanguage, "powershell");
    assert.equal(shouldUseStructuredShellCommand(parts), true);
  });
});
