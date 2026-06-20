"use client";

import { invokeDesktop } from "@/lib/desktop-bridge";
import { getDesktopShellKind } from "@/lib/desktop-shell";
import type { RevealPathScope } from "@/lib/reveal-path-in-file-manager.server";

export type RevealPathInFileManagerResult = {
  path: string;
  via: "electron" | "tauri" | "api";
  mode?: "select" | "folder";
};

async function revealViaApi(
  scope: RevealPathScope,
  path: string,
): Promise<RevealPathInFileManagerResult> {
  const response = await fetch("/api/reveal-path", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope, path }),
  });
  const data = (await response.json()) as {
    ok?: boolean;
    path?: string;
    error?: string;
  };
  if (!response.ok || !data.ok || !data.path) {
    throw new Error(data.error ?? `Reveal failed (HTTP ${response.status})`);
  }
  return { path: data.path, via: "api" };
}

async function revealViaElectron(
  scope: RevealPathScope,
  path: string,
): Promise<RevealPathInFileManagerResult> {
  const result = (await invokeDesktop("reveal_path_in_file_manager", {
    scope,
    path,
  })) as {
    ok?: boolean;
    path?: string;
    mode?: "select" | "folder";
    error?: string;
  } | null;
  if (!result?.ok || !result.path) {
    throw new Error(result?.error ?? "Desktop reveal failed");
  }
  return {
    path: result.path,
    via: "electron",
    mode: result.mode,
  };
}

async function revealViaTauri(
  scope: RevealPathScope,
  path: string,
): Promise<RevealPathInFileManagerResult> {
  const { invoke } = await import("@tauri-apps/api/core");
  const result = (await invoke("reveal_path_in_file_manager", {
    scope,
    path,
  })) as { ok?: boolean; path?: string; error?: string };
  if (!result?.ok || !result.path) {
    throw new Error(result?.error ?? "Desktop reveal failed");
  }
  return { path: result.path, via: "tauri" };
}

/**
 * Reveal a file in the OS file manager.
 * Desktop shells use native APIs first; on failure falls back to the local API route.
 */
export async function revealPathInFileManagerClient(
  scope: RevealPathScope,
  path: string,
): Promise<RevealPathInFileManagerResult> {
  const trimmed = path.trim();
  if (!trimmed) {
    throw new Error("Missing path");
  }

  const kind = getDesktopShellKind();
  if (kind === "electron") {
    try {
      return await revealViaElectron(scope, trimmed);
    } catch {
      return revealViaApi(scope, trimmed);
    }
  }

  if (kind === "tauri") {
    try {
      return await revealViaTauri(scope, trimmed);
    } catch {
      return revealViaApi(scope, trimmed);
    }
  }

  return revealViaApi(scope, trimmed);
}

export function formatRevealSuccessMessage(result: RevealPathInFileManagerResult): string {
  if (result.mode === "folder") {
    return "已打开导出目录，请在文件夹中查找该 JSON 文件。";
  }
  return "已在资源管理器中定位该文件。";
}
