/**
 * Suspend Electron global shortcuts and swallow before-input-event while
 * action-editor records sys:keyInput chords (avoids Ctrl+S / launcher hotkey, etc.).
 */

/** @param {{ getMainWindow: () => import("electron").BrowserWindow | null, emitDesktopEvent: (event: string, payload: unknown) => void, globalShortcutCommands: { suspendForKeyCapture?: () => boolean, resumeAfterKeyCapture?: () => void } | null }} deps */
export function createKeyInputCaptureCommands(deps) {
  let active = false;
  /** @type {((event: Electron.Event, input: Electron.Input) => void) | null} */
  let beforeInputHandler = null;
  let shortcutsWereSuspended = false;

  function detach() {
    const win = deps.getMainWindow();
    if (win && !win.isDestroyed() && beforeInputHandler) {
      win.webContents.removeListener("before-input-event", beforeInputHandler);
    }
    beforeInputHandler = null;
  }

  function attach() {
    const win = deps.getMainWindow();
    if (!win || win.isDestroyed()) {
      return;
    }
    const wc = win.webContents;

    beforeInputHandler = (event, input) => {
      if (!active) {
        return;
      }
      if (input.type !== "keyDown" && input.type !== "keyUp") {
        return;
      }
      event.preventDefault();
      deps.emitDesktopEvent("key_input_capture", {
        type: input.type,
        key: input.key,
        code: input.code,
        control: input.control,
        shift: input.shift,
        alt: input.alt,
        meta: input.meta,
      });
    };

    wc.on("before-input-event", beforeInputHandler);
  }

  return {
    key_input_capture_begin() {
      if (active) {
        return { ok: true, alreadyActive: true };
      }
      active = true;
      shortcutsWereSuspended = deps.globalShortcutCommands?.suspendForKeyCapture?.() === true;
      attach();
      return { ok: true };
    },
    key_input_capture_end() {
      if (!active) {
        return { ok: true };
      }
      active = false;
      detach();
      if (shortcutsWereSuspended) {
        deps.globalShortcutCommands?.resumeAfterKeyCapture?.();
        shortcutsWereSuspended = false;
      }
      return { ok: true };
    },
  };
}
