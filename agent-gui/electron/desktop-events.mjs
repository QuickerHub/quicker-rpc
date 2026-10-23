import { BrowserWindow } from "./electron-api.mjs";

export function emitDesktopEvent(event, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(`desktop:event:${event}`, payload);
    }
  }
}
