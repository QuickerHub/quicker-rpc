import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseH2Sections,
  parseIndexableSections,
  tryExtractSectionBody,
} from "@/lib/guide-markdown-section-parser";

describe("guide-markdown-section-parser", () => {
  it("parseH2Sections splits workflow sections", () => {
    const md = `# Title

intro

## Pub3 First publish

publish body alpha

## Pub5 Action page intro

preview Playwright panel`;

    const sections = parseH2Sections(md);
    assert.equal(sections.length, 2);
    assert.equal(sections[0]?.heading, "Pub3 First publish");
    assert.match(sections[0]?.body ?? "", /publish body alpha/);
    assert.equal(sections[1]?.heading, "Pub5 Action page intro");
  });

  it("parseIndexableSections uses H1 sections for KC module docs", () => {
    const md = `# sys:http

meta block

# 概述

overview body

# 参数

param body with SSE stream`;

    const sections = parseIndexableSections(md);
    assert.equal(sections.length, 2);
    assert.equal(sections[0]?.heading, "概述");
    assert.equal(sections[1]?.heading, "参数");
    assert.match(sections[1]?.body ?? "", /SSE stream/);
  });

  it("tryExtractSectionBody returns matching section text", () => {
    const md = `# sys:test

# 参数

alpha beta gamma`;
    const body = tryExtractSectionBody(md, "参数");
    assert.match(body ?? "", /alpha beta gamma/);
  });
});
