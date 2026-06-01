"use client";

import { useEffect } from "react";
import {
  applyTheme,
  getStoredTheme,
  THEME_STORAGE_KEY,
} from "@/lib/theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyTheme(getStoredTheme());

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onSchemeChange = () => {
      if (getStoredTheme() === "system") {
        applyTheme("system");
      }
    };

    media.addEventListener("change", onSchemeChange);
    return () => media.removeEventListener("change", onSchemeChange);
  }, []);

  useEffect(() => {
    const onCustomTheme = () => applyTheme(getStoredTheme());

    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === THEME_STORAGE_KEY) {
        applyTheme(getStoredTheme());
      }
    };

    window.addEventListener("agent-gui-theme-change", onCustomTheme);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("agent-gui-theme-change", onCustomTheme);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return children;
}
