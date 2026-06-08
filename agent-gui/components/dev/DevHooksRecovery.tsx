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
    const url = new URL(
      typeof window !== "undefined" ? window.location.href : "http://local/",
    );
    url.pathname = pathname || "/";
    url.searchParams.set("__qa_recover", String(Date.now()));
    return `${url.pathname}${url.search}`;
  }, [blocked, pathname]);

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
    const timer = window.setTimeout(() => {
      sessionStorage.removeItem(RELOAD_COUNT_KEY);
    }, 12_000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!blocked) return null;

  return (
    <div className="dev-hooks-recovery" role="alert">
      <div className="dev-hooks-recovery__panel">
        <p className="dev-hooks-recovery__title">界面交互已失效</p>
        <p className="dev-hooks-recovery__body">
          开发热更新导致 React 事件失效：链接可跳转，按钮点了没反应。请用下方链接刷新（不要用
          onClick 按钮）。
        </p>
        <a href={reloadHref} className="btn-primary dev-hooks-recovery__reload-link">
          刷新页面
        </a>
      </div>
    </div>
  );
}
