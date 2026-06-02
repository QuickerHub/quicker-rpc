import { isTauriShell } from "@/lib/tauri-shell";

/** Native folder picker (Tauri desktop only). Returns null if cancelled or unavailable. */
export async function pickWorkspaceDirectory(
  defaultPath?: string,
): Promise<string | null> {
  if (!isTauriShell()) return null;

  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: defaultPath?.trim() || undefined,
    });
    if (selected == null) return null;
    if (typeof selected === "string") return selected;
    if (Array.isArray(selected) && typeof selected[0] === "string") {
      return selected[0];
    }
    return null;
  } catch {
    return null;
  }
}
