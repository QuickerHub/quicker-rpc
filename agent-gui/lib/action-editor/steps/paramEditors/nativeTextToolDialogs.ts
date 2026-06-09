import { isTauriShell } from "@/lib/tauri-shell";

async function openTauriDialog(): Promise<typeof import("@tauri-apps/plugin-dialog") | null> {
  if (!isTauriShell()) {
    return null;
  }
  try {
    return await import("@tauri-apps/plugin-dialog");
  } catch {
    return null;
  }
}

/** Native file picker (Tauri shell). Returns absolute path(s) or null when cancelled/unavailable. */
export async function pickNativeTextToolFiles(multiple: boolean): Promise<string[] | null> {
  const dialog = await openTauriDialog();
  if (!dialog) {
    return null;
  }
  const selected = await dialog.open({
    multiple,
    directory: false,
  });
  if (selected == null) {
    return null;
  }
  if (typeof selected === "string") {
    return [selected];
  }
  if (Array.isArray(selected)) {
    const paths = selected.filter((item): item is string => typeof item === "string");
    return paths.length > 0 ? paths : null;
  }
  return null;
}

/** Native folder picker (Tauri shell). */
export async function pickNativeTextToolFolder(): Promise<string | null> {
  const dialog = await openTauriDialog();
  if (!dialog) {
    return null;
  }
  const selected = await dialog.open({
    directory: true,
    multiple: false,
  });
  if (selected == null) {
    return null;
  }
  if (typeof selected === "string") {
    return selected;
  }
  if (Array.isArray(selected) && typeof selected[0] === "string") {
    return selected[0];
  }
  return null;
}

/** Native save-path picker (Tauri shell). */
export async function pickNativeTextToolSavePath(defaultPath?: string): Promise<string | null> {
  const dialog = await openTauriDialog();
  if (!dialog) {
    return null;
  }
  const selected = await dialog.save({
    defaultPath: defaultPath?.trim() || undefined,
  });
  return typeof selected === "string" && selected.trim().length > 0 ? selected : null;
}
