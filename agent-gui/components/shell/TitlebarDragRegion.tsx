"use client";

import { useCallback, type ComponentPropsWithoutRef } from "react";
import {
  getDesktopShellKind,
  useDesktopShell,
  useShellPlatform,
} from "@/lib/desktop-shell";

type TitlebarDragRegionProps = ComponentPropsWithoutRef<"div">;

async function startTauriWindowDrag() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().startDragging();
}

export function TitlebarDragRegion({
  className = "",
  ...rest
}: TitlebarDragRegionProps) {
  const isDesktop = useDesktopShell();
  const platform = useShellPlatform();
  const shellKind = getDesktopShellKind();

  const useTauriApiDrag =
    shellKind === "tauri"
    && (platform === "windows" || platform === "linux");

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!useTauriApiDrag || e.button !== 0) return;
      e.preventDefault();
      void startTauriWindowDrag();
    },
    [useTauriApiDrag],
  );

  return (
    <div
      className={[
        "titlebar-drag-spacer",
        isDesktop ? "titlebar-drag-region" : "titlebar-flex-spacer",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-tauri-drag-region={
        shellKind === "tauri" && !useTauriApiDrag ? "" : undefined
      }
      onPointerDown={useTauriApiDrag ? onPointerDown : undefined}
      aria-hidden
      {...rest}
    />
  );
}
