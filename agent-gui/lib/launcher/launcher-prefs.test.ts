import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  DEFAULT_LAUNCHER_SHORTCUT,
  LAUNCHER_AUTO_VOICE_STORAGE_KEY,
  LAUNCHER_PREFS_CHANGED_EVENT,
  LAUNCHER_SHORTCUT_STORAGE_KEY,
  isLauncherAutoVoiceEnabled,
  loadLauncherShortcut,
  setLauncherAutoVoiceEnabled,
  storeLauncherShortcut,
} from "./launcher-prefs.ts";

const storage = new Map<string, string>();
const events: string[] = [];

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
  globalThis.addEventListener = ((type: string) => {
    if (type === LAUNCHER_PREFS_CHANGED_EVENT) {
      events.push(type);
    }
  }) as typeof globalThis.addEventListener;
  globalThis.dispatchEvent = ((event: Event) => {
    if (event.type === LAUNCHER_PREFS_CHANGED_EVENT) {
      events.push(event.type);
    }
    return true;
  }) as typeof globalThis.dispatchEvent;
}

function uninstallBrowserStorage(): void {
  delete (globalThis as { window?: typeof globalThis }).window;
  delete (globalThis as { localStorage?: Storage }).localStorage;
  delete (globalThis as { addEventListener?: typeof globalThis.addEventListener })
    .addEventListener;
  delete (globalThis as { dispatchEvent?: typeof globalThis.dispatchEvent })
    .dispatchEvent;
}

afterEach(() => {
  storage.clear();
  events.length = 0;
  uninstallBrowserStorage();
});

test("loadLauncherShortcut returns default without browser", () => {
  uninstallBrowserStorage();
  assert.equal(loadLauncherShortcut(), DEFAULT_LAUNCHER_SHORTCUT);
});

test("loadLauncherShortcut falls back when storage is empty or whitespace", () => {
  installBrowserStorage();
  assert.equal(loadLauncherShortcut(), DEFAULT_LAUNCHER_SHORTCUT);

  storage.set(LAUNCHER_SHORTCUT_STORAGE_KEY, "   ");
  assert.equal(loadLauncherShortcut(), DEFAULT_LAUNCHER_SHORTCUT);
});

test("storeLauncherShortcut trims and persists shortcut", () => {
  installBrowserStorage();

  storeLauncherShortcut("  Alt+Shift+F  ");
  assert.equal(storage.get(LAUNCHER_SHORTCUT_STORAGE_KEY), "Alt+Shift+F");
  assert.equal(loadLauncherShortcut(), "Alt+Shift+F");
  assert.deepEqual(events, [LAUNCHER_PREFS_CHANGED_EVENT]);
});

test("launcher auto voice prefs round-trip", () => {
  installBrowserStorage();

  assert.equal(isLauncherAutoVoiceEnabled(), false);
  setLauncherAutoVoiceEnabled(true);
  assert.equal(storage.get(LAUNCHER_AUTO_VOICE_STORAGE_KEY), "1");
  assert.equal(isLauncherAutoVoiceEnabled(), true);

  setLauncherAutoVoiceEnabled(false);
  assert.equal(storage.get(LAUNCHER_AUTO_VOICE_STORAGE_KEY), "0");
  assert.equal(isLauncherAutoVoiceEnabled(), false);
});
