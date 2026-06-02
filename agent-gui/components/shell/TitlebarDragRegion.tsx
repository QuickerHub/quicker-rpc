"use client";

import { useCallback, type ComponentPropsWithoutRef } from "react";
import { useShellPlatform, useTauriShell } from "@/lib/tauri-shell";

type TitlebarDragRegionProps = ComponentPropsWithoutRef<"div">;

async function startWindowDrag() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().startDragging();
}

export function TitlebarDragRegion({
  className = "",
  ...rest
}: TitlebarDragRegionProps) {
  const isTauri = useTauriShell();
  const platform = useShellPlatform();

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isTauri || e.button !== 0) return;
      // WebView2: CSS drag regions are unreliable; use the window API.
      if (platform === "windows" || platform === "linux") {
        e.preventDefault();
        void startWindowDrag();
      }
    },
    [isTauri, platform],
  );

  if (!isTauri) return null;

  return (
    <div
      className={`titlebar-drag-region titlebar-drag-spacer${className ? ` ${className}` : ""}`}
      data-tauri-drag-region=""
      onPointerDown={onPointerDown}
      aria-hidden
      {...rest}
    />
  );
}
