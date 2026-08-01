import assert from "node:assert/strict";
import test from "node:test";

import { pageSkillContent } from "@/lib/agent-skills/content-page";

test("pageSkillContent exposes deterministic continuation offsets", () => {
  const first = pageSkillContent("abcdefghij", 0, 4);
  assert.deepEqual(first, {
    content: "abcd",
    offset: 0,
    nextOffset: 4,
    totalChars: 10,
    truncated: true,
  });
  const last = pageSkillContent("abcdefghij", first.nextOffset!, 20);
  assert.equal(last.content, "efghij");
  assert.equal(last.nextOffset, null);
  assert.equal(last.truncated, false);
});

