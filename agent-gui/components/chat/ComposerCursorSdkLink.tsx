"use client";

import Link from "next/link";
import { isCursorSdkDevEnabled } from "@/lib/agent-gui-debug";

type ComposerCursorSdkLinkProps = {
  disabled?: boolean;
};

/** Dev-only link to /cursor-sdk from the main chat composer toolbar. */
export function ComposerCursorSdkLink({
  disabled = false,
}: ComposerCursorSdkLinkProps) {
  if (!isCursorSdkDevEnabled()) return null;

  return (
    <Link
      href="/cursor-sdk"
      className={`tool-selector-trigger composer-cursor-sdk-link${
        disabled ? " composer-cursor-sdk-link--disabled" : ""
      }`}
      title="Cursor SDK 对话（@cursor/sdk + qkrpc MCP）"
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : undefined}
      onClick={(e) => {
        if (disabled) e.preventDefault();
      }}
    >
      Cursor SDK
    </Link>
  );
}
