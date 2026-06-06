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

  const useApiDrag =
    isTauri && (platform === "windows" || platform === "linux");

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!useApiDrag || e.button !== 0) return;
      // WebView2: CSS/data-tauri-drag-region steal clicks; use startDragging only.
      e.preventDefault();
      void startWindowDrag();
    },
    [useApiDrag],
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
      data-tauri-drag-region={isTauri && !useApiDrag ? "" : undefined}
      onPointerDown={useApiDrag ? onPointerDown : undefined}
      aria-hidden
      {...rest}
    />
  );
}
