import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatLocalToolResult } from "@/lib/tool-result";
import {
  buildShellCombinedOutput,
  formatShellDisplayContent,
  formatShellEditorContent,
  collapseShellOutputForPreview,
  estimateShellOutputVisualLines,
  shellOutputExceedsPreviewLines,
  tailShellOutputForPreview,
  formatShellExitMeta,
  parseShellToolView,
  readShellToolDescription,
  stripAnsiEscapes,
  summarizeShellToolInput,
} from "./shell-tool-view";

describe("shell-tool-view", () => {
  it("merges stdout and stderr for display", () => {
    assert.equal(
      buildShellCombinedOutput("line1\n", "warn"),
      "line1\nwarn",
    );
  });

  it("parses slim shell tool output", () => {
    const output = formatLocalToolResult({
      commandLine: "git status -sb",
      durationMs: 1200,
      output: "## main\n",
    });
    const view = parseShellToolView(output);
    assert.ok(view);
    assert.equal(view!.exitCode, 0);
    assert.equal(view!.combined, "## main");
    assert.equal(formatShellExitMeta(view!), "exit 0 · 1.2s");
  });

  it("parses legacy shell tool output with stdout/stderr", () => {
    const output = formatLocalToolResult({
      action: "shell-exec",
      success: true,
      summary: "git status -sb",
      commandLine: "git status -sb",
      exitCode: 0,
      durationMs: 1200,
      stdout: "## main\n",
      stderr: "",
    });
    const view = parseShellToolView(output);
    assert.ok(view);
    assert.equal(view!.combined, "## main");
  });

  it("formats single shell editor document", () => {
    assert.equal(
      formatShellEditorContent("git --version", "git version 2.43\n"),
      "$ git --version\n\ngit version 2.43",
    );
  });

  it("reads description and prefers it for input summary", () => {
    const input = {
      description: "Verify frontend check",
      command: "Invoke-RestMethod http://127.0.0.1:3000/api/dev/frontend-check",
    };
    assert.equal(readShellToolDescription(input), "Verify frontend check");
    assert.equal(summarizeShellToolInput(input), "Verify frontend check");
  });

  it("formats display content without command when description is used", () => {
    assert.equal(
      formatShellDisplayContent("ok: true\n", { useCommandLine: false }),
      "ok: true",
    );
    assert.equal(
      formatShellDisplayContent("", { running: true, useCommandLine: false }),
      "…",
    );
    assert.equal(
      formatShellDisplayContent("done", {
        commandLine: "git status",
        useCommandLine: true,
      }),
      "$ git status\n\ndone",
    );
  });

  it("collapses long output to tail", () => {
    const text = Array.from({ length: 80 }, (_, i) => `line ${i + 1}`).join("\n");
    const collapsed = collapseShellOutputForPreview(text, 48, 36);
    assert.equal(collapsed.collapsed, true);
    assert.match(collapsed.text, /省略前 44 行/);
    assert.match(collapsed.text, /line 80/);
  });

  it("strips ANSI color escapes from terminal output", () => {
    const raw = "\u001b[32;1mSource\u001b[0m \u001b[32;1mVersion\u001b[0m";
    assert.equal(stripAnsiEscapes(raw), "Source Version");
  });

  it("tails last four lines without omission banner", () => {
    const text = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join("\n");
    const tail = tailShellOutputForPreview(text, 4);
    assert.equal(tail, "line 7\nline 8\nline 9\nline 10");
  });

  it("estimates wrapped visual lines for long single-line stdout", () => {
    const json = `{"ok":true,"items":[${'"x",'.repeat(80)}]}`;
    assert.ok(estimateShellOutputVisualLines(json) > 4);
    assert.equal(shellOutputExceedsPreviewLines(json, 4), true);
    assert.equal(shellOutputExceedsPreviewLines("ok\n", 4), false);
  });
});
