import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  EXPLORER_PANEL_VIEW_STORAGE_KEY,
  loadExplorerPanelView,
  normalizeExplorerWorkspaceKey,
  storeExplorerPanelView,
} from "./explorer-prefs.ts";

const storage = new Map<string, string>();

function installBrowserStorage(): void {
  (globalThis as { window?: typeof globalThis }).window = globalThis;
  (globalThis as { localStorage?: Storage }).localStorage = {
    get length() {
      return storage.size;
    },
    clear() {
      storage.clear();
    },
    getItem(key: string) {
      return storage.get(key) ?? null;
    },
    key(index: number) {
      return [...storage.keys()][index] ?? null;
    },
    removeItem(key: string) {
      storage.delete(key);
    },
    setItem(key: string, value: string) {
      storage.set(key, value);
    },
  } as Storage;
}

function uninstallBrowserStorage(): void {
  delete (globalThis as { window?: typeof globalThis }).window;
  delete (globalThis as { localStorage?: Storage }).localStorage;
}

afterEach(() => {
  storage.clear();
  uninstallBrowserStorage();
});

test("normalizeExplorerWorkspaceKey normalizes slashes and case", () => {
  assert.equal(
    normalizeExplorerWorkspaceKey("D:\\Source\\Repo\\"),
    "d:/source/repo",
  );
});

test("storeExplorerPanelView persists per workspace and merges patches", () => {
  installBrowserStorage();

  storeExplorerPanelView("D:\\repo-a", {
    actionTree: {
      expandedPaths: [".quicker/actions", ".quicker/actions/a1"],
      collapsedPaths: [".quicker/actions/a2"],
    },
    docsExpanded: true,
  });

  storeExplorerPanelView("D:\\repo-b", {
    actionTree: {
      expandedPaths: [".quicker/actions"],
      collapsedPaths: [],
    },
    docsExpanded: false,
  });

  const repoA = loadExplorerPanelView("d:/repo-a");
  assert.deepEqual(repoA?.actionTree.expandedPaths, [
    ".quicker/actions",
    ".quicker/actions/a1",
  ]);
  assert.deepEqual(repoA?.actionTree.collapsedPaths, [".quicker/actions/a2"]);
  assert.equal(repoA?.docsExpanded, true);
  assert.equal(repoA?.projectsExpanded, false);

  storeExplorerPanelView("D:\\repo-a", { docsExpanded: false });
  const repoAUpdated = loadExplorerPanelView("D:/repo-a");
  assert.equal(repoAUpdated?.docsExpanded, false);
  assert.equal(repoAUpdated?.projectsExpanded, false);
  assert.deepEqual(repoAUpdated?.actionTree.expandedPaths, [
    ".quicker/actions",
    ".quicker/actions/a1",
  ]);

  assert.equal(loadExplorerPanelView("d:/repo-b")?.docsExpanded, false);
  assert.ok(storage.has(EXPLORER_PANEL_VIEW_STORAGE_KEY));
});

test("loadExplorerPanelView returns null for unknown workspace", () => {
  installBrowserStorage();
  assert.equal(loadExplorerPanelView("d:/missing"), null);
});

test("storeExplorerPanelView persists collapsed action roots", () => {
  installBrowserStorage();

  storeExplorerPanelView("D:\\repo-a", {
    actionTree: {
      expandedPaths: [],
      collapsedPaths: [".quicker/actions", ".quicker/subprograms"],
    },
    docsExpanded: false,
    projectsExpanded: false,
  });

  const saved = loadExplorerPanelView("d:/repo-a");
  assert.deepEqual(saved?.actionTree.expandedPaths, []);
  assert.deepEqual(saved?.actionTree.collapsedPaths, [
    ".quicker/actions",
    ".quicker/subprograms",
  ]);
  assert.equal(saved?.projectsExpanded, false);
});
