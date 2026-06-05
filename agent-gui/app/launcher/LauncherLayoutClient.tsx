"use client";

import { useEffect, useLayoutEffect } from "react";
import { DocsViewerProvider } from "@/lib/docs-viewer";
import { applyTheme, getStoredTheme } from "@/lib/theme";
import { isLauncherTransparentShell } from "@/lib/launcher/launcher-shell-init";
import { useLauncherClickThrough } from "@/lib/launcher/use-launcher-click-through";
import { useLauncherTauriHidden } from "@/lib/launcher/use-launcher-tauri-hidden";

export function LauncherLayoutClient({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  useLauncherClickThrough();
  useLauncherTauriHidden();

  useLayoutEffect(() => {
    applyTheme(getStoredTheme());
    document.documentElement.classList.add("launcher-html");
    if (isLauncherTransparentShell()) {
      document.documentElement.classList.add("launcher-html--transparent");
    } else {
      document.documentElement.classList.add("launcher-html--web");
    }
  }, []);

  useEffect(() => {
    return () => {
      document.documentElement.classList.remove(
        "launcher-html",
        "launcher-html--transparent",
        "launcher-html--web",
      );
    };
  }, []);

  return <DocsViewerProvider>{children}</DocsViewerProvider>;
}
