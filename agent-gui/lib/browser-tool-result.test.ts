import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseBrowserToolResultView,
  redactBrowserBinaryFields,
  sanitizeBrowserToolDataForAgent,
  summarizeBrowserToolOutput,
} from "@/lib/browser-tool-result";

describe("browser-tool-result", () => {
  it("strips preview blobs for agent audience", () => {
    const sanitized = sanitizeBrowserToolDataForAgent({
      action: "navigate",
      url: "https://example.com/",
      previewBase64: "a".repeat(5000),
      previewMimeType: "image/jpeg",
      viewportWidth: 1280,
    });
    assert.equal(sanitized.previewBase64, undefined);
    assert.equal(sanitized.previewMimeType, undefined);
    assert.equal(sanitized.panelPreview, true);
    assert.equal(sanitized.url, "https://example.com/");
  });

  it("summarizes snapshot node count", () => {
    const summary = summarizeBrowserToolOutput(
      {
        ok: true,
        exitCode: 0,
        source: "local",
        data: { action: "snapshot", mode: "headless", background: true, nodeCount: 12, snapshot: "url: x\nnodes:" },
      },
      { action: "snapshot" },
    );
    assert.equal(summary, "Playwright · 12 个可交互元素");
  });

  it("includes embedded mode badge in summary", () => {
    const summary = summarizeBrowserToolOutput(
      {
        ok: true,
        exitCode: 0,
        source: "local",
        data: {
          action: "evaluate",
          mode: "embedded",
          showPanel: true,
          value: "ok",
        },
      },
      { action: "evaluate" },
    );
    assert.equal(summary, "内嵌 · 侧栏 · 脚本执行完成");
  });

  it("maps legacy playwright/native mode labels", () => {
    const headless = parseBrowserToolResultView({
      ok: true,
      exitCode: 0,
      source: "local",
      data: { action: "status", mode: "playwright", browserReady: true },
    });
    const embedded = parseBrowserToolResultView({
      ok: true,
      exitCode: 0,
      source: "local",
      data: { action: "status", mode: "native", browserReady: true },
    });
    assert.equal(headless?.mode, "headless");
    assert.equal(embedded?.mode, "embedded");
  });

  it("summarizes search match count", () => {
    const summary = summarizeBrowserToolOutput(
      {
        ok: true,
        exitCode: 0,
        source: "local",
        data: { action: "search", matchCount: 3, query: "获赞" },
      },
      { action: "search" },
    );
    assert.equal(summary, "搜索 3 个匹配");
  });

  it("parses tabs and snapshot fields", () => {
    const view = parseBrowserToolResultView({
      ok: true,
      exitCode: 0,
      source: "local",
      data: {
        action: "tabs",
        tabs: [{ index: 0, url: "https://a.test", title: "A", active: true }],
      },
    });
    assert.equal(view?.tabCount, 1);
    assert.equal(view?.tabs?.[0]?.url, "https://a.test");
  });

  it("redacts long base64 in nested tool output", () => {
    const redacted = redactBrowserBinaryFields({
      ok: true,
      data: { previewBase64: "x".repeat(200) },
    }) as { data: { previewBase64: string } };
    assert.match(redacted.data.previewBase64, /omitted: 200 chars/);
  });
});
