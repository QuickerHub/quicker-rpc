import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  LLM_AUTO_MODEL_CANDIDATES,
  mergeAutoModelCandidates,
  reorderAutoModelCandidates,
} from "@/lib/llm-auto-candidates";

describe("llm-auto-candidates", () => {
  it("keeps qwen3 coder first by default", () => {
    const merged = mergeAutoModelCandidates({});
    assert.equal(merged[0], LLM_AUTO_MODEL_CANDIDATES[0]);
    assert.ok(merged.includes("openai/gpt-oss-20b"));
  });

  it("dedupes configured and default candidates", () => {
    const merged = mergeAutoModelCandidates({
      primary: "qwen/qwen3-coder-480b-a35b-instruct",
      configured: [
        "openai/gpt-oss-20b",
        "qwen/qwen3-coder-480b-a35b-instruct",
      ],
    });
    assert.deepEqual(
      merged.filter((id) => id === "qwen/qwen3-coder-480b-a35b-instruct").length,
      1,
    );
  });

  it("promotes sticky preferred model to the front", () => {
    const ordered = reorderAutoModelCandidates(
      ["qwen/qwen3-coder-480b-a35b-instruct", "openai/gpt-oss-20b"],
      "openai/gpt-oss-20b",
    );
    assert.equal(ordered[0], "openai/gpt-oss-20b");
  });
});
