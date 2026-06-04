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

  return (
    <div
      className={[
        "titlebar-drag-spacer",
        isTauri ? "titlebar-drag-region" : "titlebar-flex-spacer",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-tauri-drag-region={isTauri ? "" : undefined}
      onPointerDown={isTauri ? onPointerDown : undefined}
      aria-hidden
      {...rest}
    />
  );
}
