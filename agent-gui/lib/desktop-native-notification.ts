"use client";

import { invokeDesktop } from "@/lib/desktop-bridge";
import { getDesktopShellKind } from "@/lib/desktop-shell";

export const THREAD_NOTIFICATION_ACTIVATE_EVENT = "thread-notification-activate";

export type ThreadNotificationActivateDetail = {
  threadId: string;
};

export async function showThreadRunNativeNotification(args: {
  threadId: string;
  title: string;
  body: string;
}): Promise<boolean> {
  const kind = getDesktopShellKind();
  if (kind === "electron") {
    try {
      const result = await invokeDesktop<{ ok?: boolean }>(
        "show_native_notification",
        {
          threadId: args.threadId,
          title: args.title,
          body: args.body,
        },
      );
      return result?.ok === true;
    } catch {
      return false;
    }
  }

  if (typeof Notification === "undefined") return false;
  if (Notification.permission === "default") {
    try {
      await Notification.requestPermission();
    } catch {
      return false;
    }
  }
  if (Notification.permission !== "granted") return false;

  try {
    const notification = new Notification(args.title, {
      body: args.body,
      tag: `thread-run-complete:${args.threadId}`,
    });
    notification.onclick = () => {
      window.focus();
      window.dispatchEvent(
        new CustomEvent<ThreadNotificationActivateDetail>(
          THREAD_NOTIFICATION_ACTIVATE_EVENT,
          { detail: { threadId: args.threadId } },
        ),
      );
      notification.close();
    };
    return true;
  } catch {
    return false;
  }
}
