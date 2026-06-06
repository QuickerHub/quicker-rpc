"use client";

import { useCallback, useEffect, useState } from "react";
import { REACT_HOOKS_FAULT_EVENT } from "@/components/dev/DevErrorCapture";

const RELOAD_GUARD_KEY = "qa-react-hooks-recovery-reloaded";

/** Dev-only: recover from HMR hook-order crashes that leave clicks dead. */
export function DevHooksRecovery() {
  const [blocked, setBlocked] = useState(false);

  const reload = useCallback(() => {
    window.location.reload();
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const onHooksFault = () => {
      if (sessionStorage.getItem(RELOAD_GUARD_KEY)) {
        setBlocked(true);
        return;
      }
      sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
      window.location.reload();
    };

    window.addEventListener(REACT_HOOKS_FAULT_EVENT, onHooksFault);
    return () => window.removeEventListener(REACT_HOOKS_FAULT_EVENT, onHooksFault);
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    sessionStorage.removeItem(RELOAD_GUARD_KEY);
  }, []);

  if (!blocked) return null;

  return (
    <div className="dev-hooks-recovery" role="alert">
      <div className="dev-hooks-recovery__panel">
        <p className="dev-hooks-recovery__title">界面交互已失效</p>
        <p className="dev-hooks-recovery__body">
          开发热更新导致 React Hooks 顺序错乱，页面只能 hover、无法点击。请刷新页面恢复。
        </p>
        <button type="button" className="btn-primary" onClick={reload}>
          刷新页面
        </button>
      </div>
    </div>
  );
}
