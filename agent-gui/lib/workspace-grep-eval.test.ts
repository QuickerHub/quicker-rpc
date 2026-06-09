import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_GREP_EVAL_DATASET,
  runWorkspaceGrepEval,
} from "@/lib/workspace-grep-eval";
import { shouldSkipGrepEntry } from "@/lib/workspace-file-helpers";

describe("workspace-file-helpers grep skip", () => {
  it("skips node_modules and binary extensions", () => {
    assert.equal(shouldSkipGrepEntry("node_modules", true), true);
    assert.equal(shouldSkipGrepEntry("src", true), false);
    assert.equal(shouldSkipGrepEntry("photo.png", false), true);
    assert.equal(shouldSkipGrepEntry("data.json", false), false);
  });
});

describe("workspace-grep-eval dataset", () => {
  it("loads golden cases", () => {
    assert.ok(DEFAULT_GREP_EVAL_DATASET.cases.length >= 8);
  });

  it("passes all blocking grep eval cases", async () => {
    const summary = await runWorkspaceGrepEval();
    const blocking = summary.caseResults.filter(
      (r) => !r.passed && !r.knownIssue,
    );
    if (blocking.length > 0) {
      const detail = blocking
        .map((r) => `${r.id}: ${r.failures.join("; ")}`)
        .join("\n");
      assert.fail(`Workspace grep eval failures:\n${detail}`);
    }
  });
});
