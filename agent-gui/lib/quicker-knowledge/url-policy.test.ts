import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canonicalizeQuickerKnowledgeUrl,
  classifyQuickerKnowledgeUrl,
  isAllowedQuickerKnowledgeUrl,
} from "@/lib/quicker-knowledge/url-policy";

describe("quicker knowledge URL policy", () => {
  it("allows public Quicker documentation roots", () => {
    assert.equal(isAllowedQuickerKnowledgeUrl("https://getquicker.net/KC"), true);
    assert.equal(isAllowedQuickerKnowledgeUrl("https://getquicker.net/KC/Manual"), true);
    assert.equal(isAllowedQuickerKnowledgeUrl("https://getquicker.net/Docs"), true);
  });

  it("allows manual, help, and knowledge article pages", () => {
    assert.equal(isAllowedQuickerKnowledgeUrl("https://getquicker.net/kc/manual/doc/start"), true);
    assert.equal(isAllowedQuickerKnowledgeUrl("https://getquicker.net/kc/help/doc/module/form"), true);
    assert.equal(isAllowedQuickerKnowledgeUrl("https://getquicker.net/KC/Kb/Article/123"), true);
  });

  it("rejects external, login, user, and action library pages", () => {
    assert.equal(isAllowedQuickerKnowledgeUrl("https://example.com/KC"), false);
    assert.equal(isAllowedQuickerKnowledgeUrl("https://getquicker.net/User/Login"), false);
    assert.equal(isAllowedQuickerKnowledgeUrl("https://getquicker.net/User/Actions/abc"), false);
    assert.equal(isAllowedQuickerKnowledgeUrl("https://getquicker.net/Sharedaction?code=abc"), false);
  });

  it("canonicalizes host, fragments, and tracking params", () => {
    assert.equal(
      canonicalizeQuickerKnowledgeUrl("https://getquicker.net/KC/Manual?utm_source=x#section"),
      "https://getquicker.net/KC/Manual",
    );
  });

  it("classifies source type from path", () => {
    assert.equal(classifyQuickerKnowledgeUrl("https://getquicker.net/kc/manual/doc/start"), "manual");
    assert.equal(classifyQuickerKnowledgeUrl("https://getquicker.net/kc/help/doc/form"), "action_dev");
    assert.equal(classifyQuickerKnowledgeUrl("https://getquicker.net/KC/Kb/Article/123"), "kb");
    assert.equal(classifyQuickerKnowledgeUrl("https://getquicker.net/KC"), "docs_index");
  });
});
