import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COMPOSER_ONBOARDING_TIPS } from "@/lib/composer-onboarding-tips";

describe("composer-onboarding", () => {
  it("defines mention tip with try-mention action", () => {
    const mention = COMPOSER_ONBOARDING_TIPS.find((tip) => tip.id === "mention");
    assert.equal(mention?.action, "try-mention");
    assert.match(mention?.hint ?? "", /@/);
  });

  it("has unique ids and required copy", () => {
    const ids = new Set<string>();
    for (const tip of COMPOSER_ONBOARDING_TIPS) {
      assert.ok(tip.id.length > 0);
      assert.ok(tip.label.length > 0);
      assert.ok(tip.hint.length > 0);
      assert.ok(!ids.has(tip.id), `duplicate id: ${tip.id}`);
      ids.add(tip.id);
    }
  });
});
