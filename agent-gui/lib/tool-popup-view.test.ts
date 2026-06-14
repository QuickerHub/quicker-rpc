import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveToolPopupBodyView,
} from "@/lib/tool-popup-ui-prefs";
import { toolPopupHasVisualView } from "@/lib/tool-popup-view";
import {
  parseDocsIndexResult,
  parseDocsSearchResult,
  parseDocsSnippetResult,
} from "@/lib/docs-tool-view";
import { parseWebSearchResultView } from "@/lib/web-search-tool-view";
import {
  parseTriggerEventsResultView,
  parseTriggerListResultView,
} from "@/lib/trigger-tool-view";
import {
  parseSettingsGetResultView,
  parseSettingsListResultView,
} from "@/lib/settings-tool-view";
import { parseLauncherResolveOutput } from "@/lib/launcher-resolve-view";

test("toolPopupHasVisualView true for action list output", () => {
  assert.equal(
    toolPopupHasVisualView("qkrpc_action_list", { limit: 5 }, {
      ok: true,
      exitCode: 0,
      data: {
        action: "action-list",
        items: [{ id: "a", title: "Test" }],
      },
    }),
    true,
  );
});

test("toolPopupHasVisualView true for ping response", () => {
  assert.equal(
    toolPopupHasVisualView("qkrpc_ping", undefined, {
      ok: true,
      exitCode: 0,
      data: { action: "ping", pong: true },
    }),
    true,
  );
});

test("toolPopupHasVisualView true for workspace file write diff", () => {
  assert.equal(
    toolPopupHasVisualView(
      "workspace_program",
      { action: "write_data", path: "data.json", content: "{}" },
      {
        ok: true,
        exitCode: 0,
        data: {
          action: "program-data-write",
          path: "data.json",
          bytesWritten: 2,
          previousContent: "{}",
          content: "{\n  \"x\": 1\n}",
        },
      },
    ),
    true,
  );
});

test("toolPopupHasVisualView true for Shell", () => {
  assert.equal(
    toolPopupHasVisualView("Shell", { command: "echo hi" }, undefined),
    true,
  );
});

test("toolPopupHasVisualView true for docs search", () => {
  assert.equal(
    toolPopupHasVisualView(
      "docs",
      { action: "search", query: "patch" },
      {
        ok: true,
        exitCode: 0,
        source: "local",
        data: {
          action: "docs-search",
          matchCount: 0,
          items: [],
        },
      },
    ),
    true,
  );
});

test("docsToolHasPopupVisual false before structured search output", () => {
  assert.equal(
    toolPopupHasVisualView("docs", { action: "search", query: "patch" }, undefined),
    false,
  );
});

test("resolveToolPopupBodyView coerces visual to source when unavailable", () => {
  assert.equal(resolveToolPopupBodyView("visual", false), "source");
  assert.equal(resolveToolPopupBodyView("visual", true), "visual");
  assert.equal(resolveToolPopupBodyView("source", false), "source");
});

test("parseDocsSearchResult reads indexed hits", () => {
  const view = parseDocsSearchResult({
    ok: true,
    exitCode: 0,
    source: "local",
    data: {
      action: "docs-search",
      keyword: "patch",
      matchCount: 1,
      items: [
        {
          topic: "workspace-editing",
          title: "Workspace editing",
          description: "Disk edit workflow",
          excerpt: "patch",
          snippet: "## Patch\nUse workspace_program patch.",
          score: 12.5,
        },
      ],
    },
  });
  assert.equal(view?.items.length, 1);
  assert.equal(view?.items[0]?.topic, "workspace-editing");
});

test("parseDocsIndexResult groups topics", () => {
  const view = parseDocsIndexResult({
    ok: true,
    exitCode: 0,
    source: "local",
    data: {
      action: "docs-index",
      topics: [
        {
          topic: "authoring-workflow",
          title: "Authoring workflow",
          description: "P0-P7",
          charCount: 100,
          layer: "workflow",
        },
      ],
    },
  });
  assert.equal(view?.topicCount, 1);
  assert.equal(view?.layerGroups[0]?.topics[0]?.topic, "authoring-workflow");
});

test("parseDocsSnippetResult reads snippet mode get", () => {
  const view = parseDocsSnippetResult({
    ok: true,
    exitCode: 0,
    source: "local",
    data: {
      action: "docs-get",
      mode: "snippet",
      topic: "trigger-workflow",
      title: "Trigger workflow",
      snippet: "## Events\nUse quicker_trigger events.",
    },
  });
  assert.equal(view?.topic, "trigger-workflow");
  assert.match(view?.snippet ?? "", /Events/);
});

test("parseWebSearchResultView reads result list", () => {
  const view = parseWebSearchResultView({
    ok: true,
    exitCode: 0,
    source: "local",
    data: {
      action: "web-search",
      query: "Quicker",
      provider: "duckduckgo",
      results: [{ title: "Quicker", url: "https://getquicker.net", snippet: "Automation" }],
    },
  });
  assert.equal(view?.results.length, 1);
  assert.equal(view?.provider, "duckduckgo");
});

test("parseTriggerEventsResultView reads event catalog", () => {
  const view = parseTriggerEventsResultView({
    ok: true,
    exitCode: 0,
    data: {
      action: "trigger-events",
      matchCount: 1,
      items: [
        {
          eventType: "BrowserUrlChanged",
          description: "Browser URL changed",
          fields: [{ key: "UrlPattern", label: "URL" }],
        },
      ],
    },
  });
  assert.equal(view?.items[0]?.eventType, "BrowserUrlChanged");
  assert.deepEqual(view?.items[0]?.paramKeys, ["UrlPattern"]);
});

test("parseTriggerListResultView reads rules", () => {
  const view = parseTriggerListResultView({
    ok: true,
    exitCode: 0,
    data: {
      action: "trigger-list",
      items: [
        {
          id: "rule-1",
          note: "Open on URL",
          isEnabled: true,
          eventType: "BrowserUrlChanged",
          actionTitle: "My action",
        },
      ],
    },
  });
  assert.equal(view?.items[0]?.action, "My action");
});

test("parseSettingsListResultView reads keys and pages", () => {
  const view = parseSettingsListResultView({
    ok: true,
    exitCode: 0,
    data: {
      action: "settings-list",
      query: "hotkey",
      items: [{ Key: "Hotkey.A", Title: "Hotkey A", Type: "String" }],
      pages: [{ PageId: "AppSettings", Title: "App settings" }],
    },
  });
  assert.equal(view?.items[0]?.key, "Hotkey.A");
  assert.equal(view?.pages[0]?.pageId, "AppSettings");
});

test("parseSettingsGetResultView reads value", () => {
  const view = parseSettingsGetResultView({
    ok: true,
    exitCode: 0,
    data: {
      action: "settings-get",
      key: "Theme",
      value: "Dark",
      scope: "userSettings",
    },
  });
  assert.equal(view?.key, "Theme");
  assert.equal(view?.value, "Dark");
});

test("parseLauncherResolveOutput reads ranked candidates", () => {
  const view = parseLauncherResolveOutput({
    ok: true,
    query: "回收站",
    ranked: [{ kind: "settings-page", label: "回收站", score: 1200 }],
  });
  assert.equal(view?.ranked?.length, 1);
  assert.equal(view?.ranked?.[0]?.label, "回收站");
});
