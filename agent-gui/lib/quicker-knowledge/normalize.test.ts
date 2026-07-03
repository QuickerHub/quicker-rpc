import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeQuickerKnowledgeHtml } from "@/lib/quicker-knowledge/normalize";

const SAMPLE_HTML = `<!doctype html>
<html>
<head><title>Quicker 手册</title></head>
<body>
  <nav>登录 注册 首页</nav>
  <main>
    <h1>动作面板</h1>
    <p>动作面板用于在不同软件中展示不同动作。</p>
    <h2>按场景切换</h2>
    <p>可以为不同进程设置不同动作页。</p>
    <pre><code>Ctrl + 滚轮</code></pre>
  </main>
  <footer>Copyright</footer>
</body>
</html>`;

describe("quicker knowledge normalization", () => {
  it("extracts title, main text, links, and chunks", () => {
    const result = normalizeQuickerKnowledgeHtml({
      html: SAMPLE_HTML,
      url: "https://getquicker.net/KC/Manual",
      fetchedAt: "2026-07-03T00:00:00.000Z",
    });

    assert.equal(result.page.title, "动作面板");
    assert.equal(result.page.sourceType, "docs_index");
    assert.equal(result.chunks.length, 2);
    assert.match(result.chunks[0]!.text, /动作面板用于/);
    assert.deepEqual(result.chunks[1]!.sectionPath, ["动作面板", "按场景切换"]);
    assert.doesNotMatch(result.chunks[0]!.text, /登录|Copyright/);
  });

  it("keeps readable list and code text", () => {
    const html = `<main><h1>用户输入</h1><ul><li>文本</li><li>数字</li></ul><code>sys:form</code></main>`;
    const result = normalizeQuickerKnowledgeHtml({
      html,
      url: "https://getquicker.net/kc/help/doc/form",
      fetchedAt: "2026-07-03T00:00:00.000Z",
    });
    assert.match(result.chunks.map((c) => c.text).join("\n"), /文本/);
    assert.match(result.chunks.map((c) => c.text).join("\n"), /sys:form/);
  });

  it("falls back to title tag when main content starts with h2", () => {
    const html = `<main><h2>子标题</h2><p>body</p></main><title>页面标题</title>`;
    const result = normalizeQuickerKnowledgeHtml({
      html,
      url: "https://getquicker.net/kc/help/doc/form",
      fetchedAt: "2026-07-03T00:00:00.000Z",
    });

    assert.equal(result.page.title, "页面标题");
  });

  it("prefers document content containers when main is missing", () => {
    const html = `<body><div class="side-nav">目录 噪声</div><div class="doc-content"><h1>正文标题</h1><p>正文内容</p></div></body>`;
    const result = normalizeQuickerKnowledgeHtml({
      html,
      url: "https://getquicker.net/kc/manual/doc/start",
      fetchedAt: "2026-07-03T00:00:00.000Z",
    });
    const text = result.chunks.map((c) => c.text).join("\n");

    assert.match(text, /正文内容/);
    assert.doesNotMatch(text, /目录 噪声/);
  });

  it("keeps usable text when numeric entities are malformed", () => {
    assert.doesNotThrow(() => {
      const result = normalizeQuickerKnowledgeHtml({
        html: `<main><h1>实体</h1><p>before &#999999999999; after</p></main>`,
        url: "https://getquicker.net/kc/help/doc/form",
        fetchedAt: "2026-07-03T00:00:00.000Z",
      });

      assert.match(result.chunks.map((c) => c.text).join("\n"), /before/);
      assert.match(result.chunks.map((c) => c.text).join("\n"), /after/);
    });
  });

  it("preserves nested same-tag content in document containers", () => {
    const html = `<div class="doc-content"><h1>正文</h1><div>第一段</div><p>第二段</p></div>`;
    const result = normalizeQuickerKnowledgeHtml({
      html,
      url: "https://getquicker.net/kc/manual/doc/start",
      fetchedAt: "2026-07-03T00:00:00.000Z",
    });
    const text = result.chunks.map((c) => c.text).join("\n");

    assert.match(text, /第一段/);
    assert.match(text, /第二段/);
  });

  it("ignores layout classes that merely contain the word content", () => {
    const html = [
      `<body>`,
      `<div class="navbar-collapse justify-content-between">导航噪声</div>`,
      `<div class="article-content js-toc-content"><h1>正文标题</h1><p>真正正文</p></div>`,
      `</body>`,
    ].join("");
    const result = normalizeQuickerKnowledgeHtml({
      html,
      url: "https://getquicker.net/KC/Manual/Doc/profiles",
      fetchedAt: "2026-07-03T00:00:00.000Z",
    });
    const text = result.chunks.map((c) => c.text).join("\n");

    assert.match(text, /真正正文/);
    assert.doesNotMatch(text, /导航噪声/);
  });
});
