import { BrowserWindow } from "../electron-api.mjs";

/**
 * @param {string} event
 * @param {unknown} payload
 */
export function emitDesktopEvent(event, payload) {
  const channel = `desktop:event:${event}`;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

/**
 * @param {string} phase
 * @param {number} percent
 * @param {string} message
 */
export function emitVoiceInstallProgress(phase, percent, message) {
  emitDesktopEvent("voice-plugin-install-progress", { phase, percent, message });
}
