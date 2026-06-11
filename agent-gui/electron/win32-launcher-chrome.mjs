import { spawnSync } from "node:child_process";

const DWMWA_TRANSITIONS_FORCEDISABLED = 3;

/**
 * Match Tauri launcher: disable DWM show/hide transitions on frameless transparent windows.
 * @param {import('electron').BrowserWindow} win
 */
export function applyWin32LauncherWindowChrome(win) {
  if (process.platform !== "win32" || !win || win.isDestroyed()) return;

  try {
    win.setBackgroundMaterial("none");
  } catch {
    /* Electron < 29 or older Windows builds */
  }

  disableWin32DwmTransitions(win);
}

/**
 * @param {import('electron').BrowserWindow} win
 */
function disableWin32DwmTransitions(win) {
  let handle;
  try {
    handle = win.getNativeWindowHandle();
  } catch {
    return;
  }

  const hwnd = handle.readBigUInt64LE(0);
  const powershell = `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
  const command = [
    "$ErrorActionPreference='SilentlyContinue'",
    "Add-Type @\"",
    "using System;using System.Runtime.InteropServices;",
    "public class QkLauncherDwm {",
    "  [DllImport(\\\"dwmapi.dll\\\")]",
    "  public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int attrValue, int attrSize);",
    "}\"@",
    "$disabled = 1",
    `[void][QkLauncherDwm]::DwmSetWindowAttribute([IntPtr]::new(${hwnd}), ${DWMWA_TRANSITIONS_FORCEDISABLED}, [ref]$disabled, 4)`,
  ].join("; ");

  spawnSync(
    powershell,
    ["-NoProfile", "-NonInteractive", "-Command", command],
    { windowsHide: true, timeout: 5000, stdio: "ignore" },
  );
}
