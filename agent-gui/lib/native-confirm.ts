import { isTauriShell } from "@/lib/tauri-shell";

/**
 * Runs before React hydrates in Tauri webviews.
 * tauri-plugin-dialog init-iife still calls removed `plugin:dialog|confirm`.
 */
export const TAURI_CONFIRM_PATCH_SCRIPT = `(function () {
  if (!("__TAURI_INTERNALS__" in window)) return;
  var invoke = window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__);
  window.confirm = async function (message) {
    var result = await invoke("plugin:dialog|message", {
      message: String(message ?? ""),
      buttons: "OkCancel",
    });
    return result === "Ok";
  };
})();`;

/** Re-bind window.confirm to plugin:dialog|message (see TAURI_CONFIRM_PATCH_SCRIPT). */
export function applyTauriConfirmPatch(): void {
  if (!isTauriShell()) return;
  const invoke = (
    window as unknown as {
      __TAURI_INTERNALS__: {
        invoke: (
          cmd: string,
          args?: Record<string, unknown>,
        ) => Promise<unknown>;
      };
    }
  ).__TAURI_INTERNALS__.invoke;
  const patched = async (message?: string) => {
    const result = await invoke("plugin:dialog|message", {
      message: String(message ?? ""),
      buttons: "OkCancel",
    });
    return result === "Ok";
  };
  window.confirm = patched as unknown as typeof window.confirm;
}

/** Ok/Cancel dialog; uses Tauri native dialog in desktop shell, window.confirm in browser. */
export async function nativeConfirm(
  message: string,
  options?: { title?: string },
): Promise<boolean> {
  if (!isTauriShell()) {
    return window.confirm(message);
  }
  const { confirm } = await import("@tauri-apps/plugin-dialog");
  return confirm(message, {
    title: options?.title ?? "QuickerAgent",
  });
}
