import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  LAUNCHER_AUTO_VOICE_STORAGE_KEY,
  LAUNCHER_SHORTCUT_STORAGE_KEY,
} from "./launcher-prefs.ts";
import { syncLauncherGlobalShortcut } from "./sync-launcher-global-shortcut.ts";

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
    key() {
      return null;
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
  delete (globalThis as { __TAURI__?: unknown }).__TAURI__;
  delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
}

afterEach(() => {
  storage.clear();
  uninstallBrowserStorage();
});

test("syncLauncherGlobalShortcut succeeds in browser dev shell", async () => {
  installBrowserStorage();
  storage.set(LAUNCHER_SHORTCUT_STORAGE_KEY, "Alt+Space");

  const result = await syncLauncherGlobalShortcut();
  assert.equal(result.ok, true);
  assert.equal(result.shortcut, "Alt+Space");
});

test("syncLauncherGlobalShortcut rejects invalid stored shortcut in Tauri shell", async () => {
  installBrowserStorage();
  (globalThis as { __TAURI__?: Record<string, never> }).__TAURI__ = {};
  storage.set(LAUNCHER_SHORTCUT_STORAGE_KEY, "Shift+V");

  const result = await syncLauncherGlobalShortcut();
  assert.equal(result.ok, false);
  assert.equal(result.shortcut, "Shift+V");
  assert.equal(result.error, "快捷键格式无效");
});

test("syncLauncherGlobalShortcut serializes concurrent calls", async () => {
  installBrowserStorage();
  storage.set(LAUNCHER_SHORTCUT_STORAGE_KEY, "Alt+Space");

  const order: number[] = [];
  const first = syncLauncherGlobalShortcut().then(() => {
    order.push(1);
  });
  const second = syncLauncherGlobalShortcut().then(() => {
    order.push(2);
  });

  await Promise.all([first, second]);
  assert.deepEqual(order, [1, 2]);
});

test("syncLauncherGlobalShortcut ignores auto voice in browser shell", async () => {
  installBrowserStorage();
  storage.set(LAUNCHER_SHORTCUT_STORAGE_KEY, "Alt+Space");
  storage.set(LAUNCHER_AUTO_VOICE_STORAGE_KEY, "1");

  const result = await syncLauncherGlobalShortcut();
  assert.equal(result.ok, true);
  assert.equal(result.shortcut, "Alt+Space");
});
