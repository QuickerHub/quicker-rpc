import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseAskQuestionInput } from "@/lib/ask-question-tool";
import {
  ASK_QUESTION_SCENARIOS,
  getAskQuestionScenario,
  getDefaultAskQuestionScenario,
} from "@/lib/tool-test-ask-question-scenarios";

describe("tool-test-ask-question-scenarios", () => {
  it("defines unique scenario ids", () => {
    const ids = ASK_QUESTION_SCENARIOS.map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it("all scenarios parse as valid ask_question input", () => {
    for (const scenario of ASK_QUESTION_SCENARIOS) {
      const parsed = parseAskQuestionInput(scenario.input);
      assert.ok(parsed, `scenario ${scenario.id} should parse`);
      assert.equal(parsed?.questions.length, scenario.input.questions.length);
    }
  });

  it("resolves default and by id", () => {
    const def = getDefaultAskQuestionScenario();
    assert.equal(getAskQuestionScenario(def.id)?.label, def.label);
  });
});
