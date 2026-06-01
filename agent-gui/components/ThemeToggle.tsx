"use client";

import { useCallback, useEffect, useState } from "react";
import { getStoredTheme, setStoredTheme, type ThemePreference } from "@/lib/theme";

const OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: "system", label: "系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    setPreference(getStoredTheme());

    const onThemeChange = (e: Event) => {
      const detail = (e as CustomEvent<ThemePreference>).detail;
      if (detail) setPreference(detail);
      else setPreference(getStoredTheme());
    };

    window.addEventListener("agent-gui-theme-change", onThemeChange);
    return () => window.removeEventListener("agent-gui-theme-change", onThemeChange);
  }, []);

  const select = useCallback((next: ThemePreference) => {
    setStoredTheme(next);
    setPreference(next);
  }, []);

  return (
    <div
      className="theme-toggle"
      role="group"
      aria-label="主题"
    >
      {OPTIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          className={`theme-toggle-btn${preference === value ? " theme-toggle-btn--active" : ""}`}
          aria-pressed={preference === value}
          onClick={() => select(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
