"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ActionDesignerTheme = "dark" | "light";

type ThemeContextValue = {
  theme: ActionDesignerTheme;
};

const ThemeContext = createContext<ThemeContextValue>({ theme: "dark" });

function readDomTheme(): ActionDesignerTheme {
  if (typeof document === "undefined") return "dark";
  const attr = document.documentElement.dataset.theme;
  if (attr === "light") return "light";
  if (attr === "dark") return "dark";
  if (window.matchMedia?.("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}

/** Sync Monaco/expression editor theme with agent-gui document theme. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ActionDesignerTheme>(() => readDomTheme());

  useEffect(() => {
    const sync = () => setTheme(readDomTheme());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });
    window.addEventListener("agent-gui-theme-change", sync);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", sync);
    return () => {
      observer.disconnect();
      window.removeEventListener("agent-gui-theme-change", sync);
      media.removeEventListener("change", sync);
    };
  }, []);

  const value = useMemo(() => ({ theme }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
