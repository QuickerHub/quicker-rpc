import "server-only";

import { notFound } from "next/navigation";
import { NextResponse } from "next/server";

/** Cursor SDK UI/runtime is dev-only; release builds must not expose or spawn it. */
export function isCursorSdkDevEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

/** Block API handlers in production (404 — route treated as absent). */
export function cursorSdkDevOnlyResponse(): NextResponse | null {
  if (isCursorSdkDevEnabled()) return null;
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** Block `/cursor-sdk` page in production. */
export function assertCursorSdkDevPage(): void {
  if (!isCursorSdkDevEnabled()) {
    notFound();
  }
}
