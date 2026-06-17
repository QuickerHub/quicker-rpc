import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { convertBrowserRecordingsToAction } from "@/lib/browser-to-action/convert";
import { parseSnapshotRefMap } from "@/lib/browser-to-action/snapshot-parse";
import type { BrowserRecordingEntry } from "@/lib/browser-to-action/types";

describe("parseSnapshotRefMap", () => {
  it("parses role name ref lines", () => {
    const yaml = `url: https://example.com
title: Example
nodes:
  - role=link name="登录" ref=e1
  - role=textbox name="搜索" ref=e2 nth=0`;
    const map = parseSnapshotRefMap(yaml);
    assert.deepEqual(map.get("e1"), { role: "link", name: "登录", nth: 0 });
    assert.deepEqual(map.get("e2"), { role: "textbox", name: "搜索", nth: 0 });
  });
});

describe("convertBrowserRecordingsToAction", () => {
  it("converts navigate + evaluate", () => {
    const recordings: BrowserRecordingEntry[] = [
      {
        source: "browser",
        input: { action: "navigate", url: "https://httpbin.org/html" },
      },
      {
        source: "browser",
        input: {
          action: "evaluate",
          script: "document.querySelector('h1')?.innerText",
        },
      },
    ];

    const result = convertBrowserRecordingsToAction(recordings, { addComments: false });
    assert.equal(result.ok, true);
    assert.equal(result.steps.length, 2);
    assert.equal(result.steps[0]?.stepRunnerKey, "sys:chromecontrol");
    assert.equal(result.steps[0]?.inputParams.operation, "OpenUrl");
    assert.equal(result.steps[0]?.inputParams.url, "https://httpbin.org/html");
    assert.equal(result.steps[0]?.outputParams?.tabId, "browserTab");
    assert.equal(result.steps[1]?.inputParams.operation, "RunScript");
    assert.equal(result.steps[1]?.inputParams["tabId.var"], "browserTab");
    assert.ok(result.variables.some((v) => v.key === "browserTab"));
    assert.ok(result.variables.some((v) => v.key === "pageResult"));
  });

  it("converts evaluate with url as OpenUrl + RunScript", () => {
    const recordings: BrowserRecordingEntry[] = [
      {
        source: "browser",
        input: {
          action: "evaluate",
          url: "https://example.com",
          script: "document.title",
        },
      },
    ];

    const result = convertBrowserRecordingsToAction(recordings, { addComments: false });
    assert.equal(result.steps.length, 2);
    assert.equal(result.steps[0]?.inputParams.operation, "OpenUrl");
    assert.equal(result.steps[1]?.inputParams.operation, "RunScript");
  });

  it("converts click when refTarget provided", () => {
    const recordings: BrowserRecordingEntry[] = [
      {
        source: "browser",
        input: { action: "navigate", url: "https://example.com" },
      },
      {
        source: "browser",
        input: { action: "click", ref: "e1" },
        refTarget: { role: "button", name: "Go", nth: 0 },
      },
    ];

    const result = convertBrowserRecordingsToAction(recordings, { addComments: false });
    const runScript = result.steps.find(
      (s) =>
        s.inputParams.operation === "RunScript"
        && String(s.inputParams.script).includes("click"),
    );
    assert.ok(runScript);
  });

  it("skips click without refTarget", () => {
    const recordings: BrowserRecordingEntry[] = [
      {
        source: "browser",
        input: { action: "navigate", url: "https://example.com" },
      },
      { source: "browser", input: { action: "click", ref: "e1" } },
    ];

    const result = convertBrowserRecordingsToAction(recordings, { addComments: false });
    assert.ok(result.skipped.some((s) => s.action === "click"));
  });

  it("passes through user_browser run", () => {
    const recordings: BrowserRecordingEntry[] = [
      {
        source: "user_browser",
        input: {
          action: "run",
          operation: "OpenUrl",
          parameters: { url: "https://example.com", windowId: "New", waitComplete: true },
        },
      },
    ];

    const result = convertBrowserRecordingsToAction(recordings, { addComments: false });
    assert.equal(result.steps[0]?.inputParams.operation, "OpenUrl");
    assert.equal(result.steps[0]?.inputParams.url, "https://example.com");
  });
});
