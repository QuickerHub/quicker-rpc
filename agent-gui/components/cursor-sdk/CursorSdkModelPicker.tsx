"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  filterCursorSdkModelOptions,
  type CursorSdkModelOption,
} from "@/lib/cursor-sdk/model-options";
import { computeFloatingMenuLayout } from "@/lib/floating-menu-layout";
import { useMountedAriaControlsId } from "@/lib/use-mounted-aria-controls-id";

export type { CursorSdkModelOption };

const PANEL_WIDTH_PX = 248;
const PANEL_MAX_HEIGHT_PX = 320;

type CursorSdkModelPickerProps = {
  modelId: string;
  options: CursorSdkModelOption[];
  disabled?: boolean;
  onChange: (modelId: string) => void;
};

function ChevronDownIcon() {
  return (
    <svg
      className="model-picker-trigger-chevron"
      width="12"
      height="12"
      viewBox="0 0 12 12"
      aria-hidden
    >
      <path
        d="M3 4.5 6 7.5 9 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const CursorSdkModelPicker = memo(function CursorSdkModelPicker({
  modelId,
  options,
  disabled = false,
  onChange,
}: CursorSdkModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [panelLayout, setPanelLayout] = useState<ReturnType<
    typeof computeFloatingMenuLayout
  > | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelId = useMountedAriaControlsId();
  const active =
    options.find((opt) => opt.id === modelId) ?? options[0] ?? null;

  const filteredOptions = useMemo(
    () => filterCursorSdkModelOptions(options, query),
    [options, query],
  );

  const updatePanelLayout = useCallback(() => {
    const button = triggerRef.current;
    if (!button) return;
    setPanelLayout(
      computeFloatingMenuLayout(
        button.getBoundingClientRect(),
        PANEL_WIDTH_PX,
        PANEL_MAX_HEIGHT_PX,
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
    if (!open) {
      setQuery("");
      return;
    }
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const panel =
    open && panelLayout ? (
      <div
        ref={panelRef}
        id={panelId}
        className="composer-popup cursor-sdk-model-picker__panel composer-popup-portal"
        role="listbox"
        aria-label="Cursor SDK 模型"
        style={{
          position: "fixed",
          top: panelLayout.top,
          left: panelLayout.left,
          width: PANEL_WIDTH_PX,
          maxHeight: panelLayout.maxHeight,
          transform: panelLayout.transform,
          zIndex: 1200,
        }}
      >
        <div className="cursor-sdk-model-picker__head">
          <span className="cursor-sdk-model-picker__title">Cursor 模型</span>
          <span className="cursor-sdk-model-picker__hint">
            切换模型将开启新 SDK 会话
          </span>
        </div>
        {options.length > 6 ? (
          <div className="model-picker-search-wrap">
            <input
              ref={searchRef}
              type="search"
              className="model-picker-search"
              placeholder="搜索模型…"
              value={query}
              aria-label="搜索 Cursor 模型"
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        ) : null}
        <ul className="model-picker-list cursor-sdk-model-picker__list">
          {filteredOptions.length === 0 ? (
            <li className="model-picker-empty">无匹配模型</li>
          ) : (
            filteredOptions.map((opt) => {
              const selected = opt.id === modelId;
              return (
                <li key={opt.id} className="model-picker-row">
                  <button
                    type="button"
                    className={`model-picker-item${
                      selected ? " model-picker-row--selected" : ""
                    }`}
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(opt.id);
                      setOpen(false);
                    }}
                  >
                    <span className="model-picker-item-main">
                      <span className="model-picker-item-name">{opt.label}</span>
                      <span className="model-picker-item-tier">{opt.id}</span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    ) : null;

  return (
    <div className="model-picker cursor-sdk-model-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`model-picker-trigger${open ? " model-picker-trigger--open" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={panelId}
        title={active ? `Cursor · ${active.label}` : "选择 Cursor 模型"}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="model-picker-trigger-text">
          <span className="model-picker-trigger-name">
            {active?.label ?? modelId}
          </span>
        </span>
        <ChevronDownIcon />
      </button>
      {typeof document !== "undefined" && panel
        ? createPortal(panel, document.body)
        : null}
    </div>
  );
});
