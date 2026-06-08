"use client";

import { useEffect, useState } from "react";
import type { ChatStoreData } from "@/lib/chat-store";
import { chatStoreHasPersistedMessages } from "@/lib/chat-store";
import { isAgentGuiDebugMode } from "@/lib/agent-gui-debug";
import { isTauriShell } from "@/lib/tauri-shell";

const PREFERRED_CHAT_PORT = "3000";

type ChatStoragePortBannerProps = {
  store: ChatStoreData;
};

/**
 * Dev-only: warn when UI runs on a non-3000 port with an empty store while :3000
 * still responds — chat history is per-origin in localStorage.
 */
export function ChatStoragePortBanner({ store }: ChatStoragePortBannerProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      setShow(false);
      return;
    }

    const port = window.location.port;
    if (!port || port === PREFERRED_CHAT_PORT) {
      setShow(false);
      return;
    }
    if (chatStoreHasPersistedMessages(store)) {
      setShow(false);
      return;
    }

    if (isTauriShell()) {
      setShow(true);
      return;
    }

    if (!isAgentGuiDebugMode()) {
      setShow(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `http://127.0.0.1:${PREFERRED_CHAT_PORT}/api/ping`,
          { cache: "no-store" },
        );
        if (!cancelled && res.ok) {
          setShow(true);
        }
      } catch {
        if (!cancelled) setShow(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [store]);

  if (!show) return null;

  const currentPort =
    typeof window !== "undefined" ? window.location.port : "";
  const inTauri = typeof window !== "undefined" && isTauriShell();

  return (
    <div className="chat-storage-port-banner" role="status">
      <span className="chat-storage-port-banner__text">
        当前页面在端口 {currentPort}，历史对话通常保存在{" "}
        <strong>http://127.0.0.1:{PREFERRED_CHAT_PORT}</strong> 的 WebView 存储中。
        {inTauri
          ? " 请使用侧栏底部的「从老版本恢复…」，或安装修复版后重启应用。"
          : " 若侧栏为空，请打开该地址或只保留一个 dev 服务占用 3000。"}
      </span>
      {!inTauri ? (
        <a
          className="chat-storage-port-banner__link"
          href={`http://127.0.0.1:${PREFERRED_CHAT_PORT}`}
        >
          打开 :{PREFERRED_CHAT_PORT}
        </a>
      ) : null}
    </div>
  );
}
