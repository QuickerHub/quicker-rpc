"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { REACT_HOOKS_FAULT_EVENT } from "@/components/dev/DevErrorCapture";

const RELOAD_COUNT_KEY = "qa-react-hooks-recovery-count";
const MAX_AUTO_RELOADS = 3;

function hardReload(): void {
  const url = new URL(window.location.href);
  url.searchParams.set("__qa_recover", String(Date.now()));
  window.location.replace(url.toString());
}

/** Dev-only: recover from HMR hook-order crashes that leave clicks dead. */
export function DevHooksRecovery() {
  const pathname = usePathname();
  const [blocked, setBlocked] = useState(false);

  const reloadHref = useMemo(() => {
    if (typeof window === "undefined") return "/";
    const url = new URL(window.location.href);
    url.pathname = pathname || url.pathname || "/";
    url.searchParams.set("__qa_recover", String(Date.now()));
    return url.toString();
  }, [blocked, pathname]);

  useEffect(() => {
    if (!blocked) return;
    sessionStorage.removeItem(RELOAD_COUNT_KEY);
  }, [blocked]);

  const scheduleReload = useCallback(() => {
    const count = Number.parseInt(
      sessionStorage.getItem(RELOAD_COUNT_KEY) ?? "0",
      10,
    );
    if (count >= MAX_AUTO_RELOADS) {
      setBlocked(true);
      return;
    }
    sessionStorage.setItem(RELOAD_COUNT_KEY, String(count + 1));
    hardReload();
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const onHooksFault = () => {
      scheduleReload();
    };

    window.addEventListener(REACT_HOOKS_FAULT_EVENT, onHooksFault);
    return () => window.removeEventListener(REACT_HOOKS_FAULT_EVENT, onHooksFault);
  }, [scheduleReload]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (window.location.search.includes("__qa_recover=")) {
      sessionStorage.removeItem(RELOAD_COUNT_KEY);
      setBlocked(false);
    }
    const timer = window.setTimeout(() => {
      sessionStorage.removeItem(RELOAD_COUNT_KEY);
      setBlocked(false);
    }, 12_000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!blocked) return null;

  return (
    <div className="dev-hooks-recovery" role="alert">
      <div className="dev-hooks-recovery__panel">
        <p className="dev-hooks-recovery__title">界面交互已失效</p>
        <p className="dev-hooks-recovery__body">
          开发热更新导致 React 事件失效：链接可跳转，按钮点了没反应。请点下方链接或按{" "}
          <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> 硬刷新（勿依赖 onClick 按钮）。
        </p>
        <a
          href={reloadHref}
          className="btn-primary dev-hooks-recovery__reload-link"
          rel="nofollow"
        >
          刷新页面
        </a>
      </div>
    </div>
  );
}
