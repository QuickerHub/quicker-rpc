import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findDirectLauncherCacheMatch,
  formatLauncherCommandCachePromptBlock,
  matchLauncherCommandCacheEntries,
  normalizeLauncherCommandPhrase,
  scoreLauncherCommandMatch,
  type LauncherCommandCacheEntry,
} from "./launcher-command-cache-core.ts";

const recycleBinEntry: LauncherCommandCacheEntry = {
  id: "test-recycle",
  trigger: "打开动作回收站",
  steps: [
    {
      toolName: "quicker_settings",
      input: { action: "open", page: "recycle-bin" },
    },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  useCount: 3,
};

describe("normalizeLauncherCommandPhrase", () => {
  it("strips punctuation and tags", () => {
    assert.equal(
      normalizeLauncherCommandPhrase('  打开动作回收站。 <qka id="x">Foo</qka>  '),
      "打开动作回收站",
    );
  });
});

describe("scoreLauncherCommandMatch", () => {
  it("scores exact and near matches highly", () => {
    assert.equal(scoreLauncherCommandMatch("打开动作回收站", recycleBinEntry), 100);
    assert.ok(scoreLauncherCommandMatch("请打开动作回收站", recycleBinEntry) >= 85);
  });

  it("scores unrelated text low", () => {
    assert.ok(scoreLauncherCommandMatch("运行剪贴板动作", recycleBinEntry) < 55);
  });
});

describe("matchLauncherCommandCacheEntries", () => {
  it("returns ranked matches", () => {
    const matches = matchLauncherCommandCacheEntries("打开动作回收站", [
      recycleBinEntry,
    ]);
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.entry.id, "test-recycle");
  });
});

describe("findDirectLauncherCacheMatch", () => {
  it("matches exact trigger only", () => {
    assert.equal(
      findDirectLauncherCacheMatch("打开动作回收站", [recycleBinEntry])?.id,
      "test-recycle",
    );
    assert.equal(findDirectLauncherCacheMatch("请打开动作回收站", [recycleBinEntry]), undefined);
  });
});

describe("formatLauncherCommandCachePromptBlock", () => {
  it("includes trigger and tool steps", () => {
    const block = formatLauncherCommandCachePromptBlock([
      { entry: recycleBinEntry, score: 100 },
    ]);
    assert.ok(block?.includes("打开动作回收站"));
    assert.ok(block?.includes('quicker_settings({"action":"open","page":"recycle-bin"})'));
  });
});
