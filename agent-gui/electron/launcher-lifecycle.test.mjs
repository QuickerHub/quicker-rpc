import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

const createdWindows = [];

/** No Electron, HWND, child process, network, or wall-clock wait is used here. */
class FakeBrowserWindow extends EventEmitter {
  constructor(options) {
    super();
    this.options = options;
    this.visible = false;
    this.focused = false;
    this.destroyed = false;
    this.showCount = 0;
    this.closeCount = 0;
    this.bounds = { x: 0, y: 0, width: options.width, height: options.height };
    this.events = [];
    this.webContents = { send: (channel, payload) => this.events.push({ channel, payload }) };
    createdWindows.push(this);
  }

  isDestroyed() { return this.destroyed; }
  isVisible() { return this.visible; }
  isFocused() { return this.focused; }
  isMaximized() { return false; }
  getBounds() { return { ...this.bounds }; }
  getSize() { return [this.bounds.width, this.bounds.height]; }
  setBounds(bounds) { this.bounds = { ...bounds }; }
  setSize(width, height) { Object.assign(this.bounds, { width, height }); }
  setAlwaysOnTop() {}
  setSkipTaskbar() {}
  setResizable() {}
  setMaximizable() {}
  setMinimumSize() {}
  setMaximumSize() {}
  setBackgroundMaterial() {}
  getNativeWindowHandle() { throw new Error("Native window access is forbidden in this fixture"); }

  loadURL(url) {
    this.url = url;
    return Promise.resolve();
  }

  show() {
    assert.equal(this.destroyed, false, "a late callback must not show a destroyed window");
    this.showCount += 1;
    this.visible = true;
  }

  focus() {
    assert.equal(this.destroyed, false, "a late callback must not focus a destroyed window");
    if (this.focused) return;
    this.focused = true;
    this.emit("focus");
  }

  blur() {
    if (!this.focused) return;
    this.focused = false;
    this.emit("blur");
  }

  hide() {
    this.visible = false;
    this.blur();
  }

  close() {
    this.closeCount += 1;
    this.destroy();
  }

  destroy() {
    if (this.destroyed) return;
    this.visible = false;
    this.focused = false;
    this.destroyed = true;
    this.emit("closed");
  }

  ready() { this.emit("ready-to-show"); }
}

globalThis.__QUICKER_ELECTRON__ = {
  app: {},
  BrowserWindow: FakeBrowserWindow,
  screen: {
    getCursorScreenPoint: () => ({ x: 640, y: 480 }),
    getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }),
  },
};

const { createLauncherCommands, LAUNCHER_HIDDEN_EVENT } = await import("./commands/launcher.mjs");

function fixture(t) {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 10_000 });
  const start = createdWindows.length;
  const owners = [];
  const makeOwner = (name = "main") => {
    const primary = { isDestroyed: () => false, isVisible: () => true, focus() {} };
    const owner = createLauncherCommands({
      getUiBaseUrl: () => `http://127.0.0.1:43210/${name}`,
      getMainWindow: () => primary,
      electronRoot: "fixture-electron",
      preloadPath: "fixture-preload.mjs",
    });
    owners.push(owner);
    return owner;
  };
  t.after(() => {
    for (const owner of owners) owner.dispose?.();
    for (const win of createdWindows.slice(start)) win.destroy();
  });
  return { makeOwner, windows: () => createdWindows.slice(start), tick: (ms) => t.mock.timers.tick(ms) };
}

function showReady(owner) {
  owner.launcher_show({});
  const win = owner.getLauncherWindow();
  assert.ok(win);
  win.ready();
  assert.equal(win.isVisible(), true);
  return win;
}

const hiddenEvents = (win) => win.events.filter(({ channel }) => channel === `desktop:event:${LAUNCHER_HIDDEN_EVENT}`);

test("cold launcher show then hide stays hidden when ready arrives", (t) => {
  const { makeOwner, tick } = fixture(t);
  const owner = makeOwner();
  owner.launcher_show({});
  const win = owner.getLauncherWindow();
  assert.equal(win.isVisible(), false, "cold show waits for the page readiness event");
  owner.launcher_hide();
  win.ready();
  tick(10_000);
  assert.equal(win.isVisible(), false, "ready-to-show cannot override the newer hide request");
  assert.equal(win.showCount, 0);

  win.destroy();
  owner.launcher_show({});
  const retiredWindow = owner.getLauncherWindow();
  retiredWindow.destroy();
  owner.launcher_show({});
  const replacement = owner.getLauncherWindow();
  assert.notEqual(retiredWindow, replacement);
  retiredWindow.ready();
  assert.equal(replacement.isVisible(), false, "an old window cannot satisfy its replacement's readiness");
  replacement.ready();
  retiredWindow.emit("closed");
  assert.equal(owner.getLauncherWindow(), replacement, "a late closed event cannot clear the new window owner");
  assert.equal(replacement.isVisible(), true);
});

test("an immediate launcher blur hides at the end of its 1200ms suppression window", (t) => {
  const { makeOwner, tick } = fixture(t);
  const owner = makeOwner();
  const win = showReady(owner);
  win.blur();
  tick(1_199);
  assert.equal(win.isVisible(), true, "the initial focus transition is still suppressed");
  tick(1);
  assert.equal(win.isVisible(), false, "a still-unfocused launcher must eventually hide");
  assert.equal(hiddenEvents(win).length, 1);
});

test("refocusing during blur suppression keeps the launcher visible", (t) => {
  const { makeOwner, tick } = fixture(t);
  const owner = makeOwner();
  const win = showReady(owner);
  win.blur();
  tick(600);
  win.focus();
  tick(5_000);
  assert.equal(win.isVisible(), true, "the earlier blur callback cannot hide a refocused window");
  assert.equal(hiddenEvents(win).length, 0);
  win.blur();
  assert.equal(win.isVisible(), false, "a later blur outside suppression still hides normally");
});

test("hide and reopen cancel the older deferred blur instead of hiding the new show", (t) => {
  const { makeOwner, tick } = fixture(t);
  const owner = makeOwner();
  const win = showReady(owner);
  win.blur();
  tick(600);
  owner.launcher_hide();
  owner.launcher_show({});
  tick(600);
  assert.equal(win.isVisible(), true, "the first blur deadline belongs to the previous visibility cycle");
  tick(5_000);
  assert.equal(win.isVisible(), true);
  assert.equal(hiddenEvents(win).length, 1);
  win.blur();
  assert.equal(win.isVisible(), false);
});

test("dispose is idempotent and cancels pending launcher prewarm", (t) => {
  const { makeOwner, windows, tick } = fixture(t);
  const owner = makeOwner();
  owner.scheduleLauncherPrewarm(false);
  tick(1_999);
  assert.equal(windows().length, 0);
  assert.equal(typeof owner.dispose, "function", "the Launcher owner must expose shutdown cleanup");
  owner.dispose();
  owner.dispose();
  tick(10_000);
  assert.equal(windows().length, 0, "a disposed owner cannot construct its delayed hidden window");
});

test("dispose closes only its owned window and ignores a late ready event", (t) => {
  const { makeOwner, tick } = fixture(t);
  const first = makeOwner("first");
  const second = makeOwner("second");
  first.launcher_show({});
  second.launcher_show({});
  const firstWindow = first.getLauncherWindow();
  const secondWindow = second.getLauncherWindow();
  assert.notEqual(firstWindow, secondWindow);
  assert.equal(typeof first.dispose, "function", "the Launcher owner must expose shutdown cleanup");
  first.dispose();
  first.dispose();
  assert.equal(firstWindow.isDestroyed(), true);
  assert.equal(first.getLauncherWindow(), null);
  assert.equal(secondWindow.isDestroyed(), false);
  assert.doesNotThrow(() => firstWindow.ready(), "a late ready event must not resurrect the disposed window");
  secondWindow.ready();
  tick(10_000);
  assert.equal(firstWindow.isVisible(), false);
  assert.equal(firstWindow.showCount, 0);
  assert.equal(secondWindow.isVisible(), true, "disposing one owner leaves the other owner intact");
});

test("repeated shows and hides keep deferred focus work scoped to their own owner", (t) => {
  const { makeOwner, tick } = fixture(t);
  const first = makeOwner("first");
  const second = makeOwner("second");
  const firstWindow = showReady(first);
  const secondWindow = showReady(second);
  first.launcher_show({});
  first.launcher_show({});
  firstWindow.blur();
  tick(1_200);
  assert.equal(firstWindow.isVisible(), false, "repeat show on an already focused window must retain blur handling without another native focus event");
  first.launcher_show({});
  first.launcher_hide();
  first.launcher_hide();
  first.launcher_show({});
  second.launcher_show({});
  firstWindow.blur();
  secondWindow.blur();
  tick(600);
  firstWindow.focus();
  tick(600);
  assert.equal(first.getLauncherWindow(), firstWindow);
  assert.equal(second.getLauncherWindow(), secondWindow);
  assert.equal(firstWindow.isVisible(), true);
  assert.equal(secondWindow.isVisible(), false, "the first owner's refocus must not cancel the second owner's hide");
  second.launcher_show({});
  first.launcher_hide();
  tick(5_000);
  assert.equal(firstWindow.isVisible(), false);
  assert.equal(secondWindow.isVisible(), true, "the first owner's hide must not affect the second owner's reopen");
});
