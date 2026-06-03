"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { getStoredTheme, setStoredTheme, type ThemePreference } from "@/lib/theme";
import { THEME_OPTIONS } from "@/lib/theme-constants";
import { computeFloatingMenuLayout } from "@/lib/floating-menu-layout";
import { useMountedAriaControlsId } from "@/lib/use-mounted-aria-controls-id";

const THEME_PANEL_WIDTH_PX = 132;

function IconTheme() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M8 1.25v1.5M8 13.25v1.5M1.25 8h1.5M13.25 8h1.5M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TitlebarThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [panelLayout, setPanelLayout] = useState<{
    top: number;
    left: number;
    maxHeight: number;
    transform?: string;
  } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useMountedAriaControlsId();

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

  const selectTheme = useCallback((next: ThemePreference) => {
    setStoredTheme(next);
    setPreference(next);
    setOpen(false);
  }, []);

  const updatePanelLayout = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    setPanelLayout(
      computeFloatingMenuLayout(
        button.getBoundingClientRect(),
        THEME_PANEL_WIDTH_PX,
        132,
        "start",
      ),
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPanelLayout(null);
      return;
    }
    updatePanelLayout();
    window.addEventListener("resize", updatePanelLayout);
    window.addEventListener("scroll", updatePanelLayout, true);
    return () => {
      window.removeEventListener("resize", updatePanelLayout);
      window.removeEventListener("scroll", updatePanelLayout, true);
    };
  }, [open, updatePanelLayout]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const panel =
    open && panelLayout ? (
      <div
        ref={panelRef}
        id={panelId}
        className="composer-popup titlebar-theme-panel titlebar-theme-panel--portal"
        role="menu"
        aria-label="主题"
        style={{
          position: "fixed",
          top: panelLayout.top,
          left: panelLayout.left,
          width: THEME_PANEL_WIDTH_PX,
          maxHeight: panelLayout.maxHeight,
          transform: panelLayout.transform,
          zIndex: 260,
        }}
      >
        {THEME_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="menuitemradio"
            className={`titlebar-theme-option${preference === value ? " titlebar-theme-option--active" : ""}`}
            aria-checked={preference === value}
            onClick={() => selectTheme(value)}
          >
            {label}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <div className="titlebar-theme-switcher">
      <button
        ref={buttonRef}
        type="button"
        className={`ws-icon-btn titlebar-theme-trigger${open ? " titlebar-theme-trigger--open" : ""}`}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="menu"
        title="切换主题（仅开发模式）"
        onClick={() => setOpen((v) => !v)}
      >
        <IconTheme />
      </button>
      {typeof document !== "undefined" && panel
        ? createPortal(panel, document.body)
        : null}
    </div>
  );
}
