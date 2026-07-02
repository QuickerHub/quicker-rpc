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
});
