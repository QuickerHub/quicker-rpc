import { contextBridge, ipcRenderer } from "electron";

const windowRole =
  process.argv
    .find((arg) => arg.startsWith("--quicker-agent-window="))
    ?.split("=")[1]
  ?? "main";

contextBridge.exposeInMainWorld("__DESKTOP_SHELL__", "electron");

contextBridge.exposeInMainWorld("__ELECTRON_WINDOW__", {
  role: windowRole,
});

contextBridge.exposeInMainWorld("__ELECTRON__", {
  invoke(command, args = {}) {
    return ipcRenderer.invoke("desktop:invoke", { command, args });
  },
  windowAction(action) {
    return ipcRenderer.invoke("desktop:window", { action });
  },
  on(event, handler) {
    const channel = `desktop:event:${event}`;
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
