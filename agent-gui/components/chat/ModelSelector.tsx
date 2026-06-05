"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  computeFloatingMenuLayout,
  type FloatingMenuLayout,
} from "@/lib/floating-menu-layout";
import { useMountedAriaControlsId } from "@/lib/use-mounted-aria-controls-id";
import {
  CUSTOM_PROVIDER_ID,
  type LlmProviderId,
} from "@/lib/llm-providers";
import type { LlmModelOption, LlmOptionsResponse } from "@/lib/llm-options-shared";
import {
  pickInitialLauncherLlmSelection,
  pickInitialLlmSelection,
} from "@/lib/llm-options-shared";
import {
  formatContextWindow,
  getModelPickerDisplay,
  matchesModelPickerQuery,
} from "@/lib/model-picker-display";
import { LLM_KEYS_UPDATED_EVENT } from "@/lib/llm-settings-events";
import {
  loadStoredLlmSelectionRaw,
  storeLlmSelectionRaw,
} from "@/lib/llm-prefs";

export type { LlmModelOption, LlmOptionsResponse };

type ModelSelectorProps = {
  selection: string;
  onChange: (selection: string) => void;
  onNeedSettings?: () => void;
  disabled?: boolean;
  /** When false, only onChange runs (launcher-local model prefs). */
  persistGlobalSelection?: boolean;
};

/** Matches .model-picker-panel { width: min(15.5rem, …) } */
const MODEL_PICKER_MENU_WIDTH_PX = 248;
/** Matches min(22rem, 52vh) upper bound used in CSS */
const MODEL_PICKER_MENU_MAX_HEIGHT_PX = 352;

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

function CheckIcon() {
  return (
    <svg
      className="model-picker-item-check"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden
    >
      <path
        d="M3.25 8.25 6.5 11.5 12.75 4.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function optionProviderId(option: LlmModelOption): LlmProviderId {
  return option.providerId ?? CUSTOM_PROVIDER_ID;
}

function optionDisplay(option: LlmModelOption) {
  if (option.kind === "auto") {
    return {
      displayName: option.label,
      tier: "Fast" as const,
    };
  }
  return getModelPickerDisplay(
    optionProviderId(option),
    option.modelId,
    option.kind === "profile" ? option.title ?? option.label : undefined,
  );
}

export function hasConfiguredLlmOption(data: LlmOptionsResponse): boolean {
  return data.options.some((o) => o.configured);
}

export function pickInitialLlmSelectionFromApi(
  data: LlmOptionsResponse,
  storedRaw: string | undefined,
): string {
  return pickInitialLlmSelection(data, storedRaw);
}

export function pickInitialLauncherLlmSelectionFromApi(
  data: LlmOptionsResponse,
  storedRaw: string | undefined,
): string {
  return pickInitialLauncherLlmSelection(data, storedRaw);
}

export async function fetchLlmOptions(): Promise<LlmOptionsResponse | null> {
  const res = await fetch("/api/llm");
  if (!res.ok) return null;
  return (await res.json()) as LlmOptionsResponse;
}

async function persistActiveSelection(selection: string): Promise<void> {
  await fetch("/api/settings/llm-keys", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ activeSelection: selection }),
  }).catch(() => undefined);
}

export function ModelSelector({
  selection,
  onChange,
  onNeedSettings,
  disabled,
  persistGlobalSelection = true,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hoveredSelection, setHoveredSelection] = useState<string | null>(null);
  const [options, setOptions] = useState<LlmModelOption[]>([]);
  const [ready, setReady] = useState(false);
  const [directOverride, setDirectOverride] = useState(false);
  const [panelLayout, setPanelLayout] = useState<FloatingMenuLayout | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelId = useMountedAriaControlsId();

  const refreshOptions = useCallback(async () => {
    const data = await fetchLlmOptions();
    if (!data) return;
    setOptions(data.options);
    setDirectOverride(Boolean(data.directOverride));
    setReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refreshOptions();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshOptions]);

  useEffect(() => {
    const onKeysUpdated = () => {
      void refreshOptions();
    };
    window.addEventListener(LLM_KEYS_UPDATED_EVENT, onKeysUpdated);
    return () => window.removeEventListener(LLM_KEYS_UPDATED_EVENT, onKeysUpdated);
  }, [refreshOptions]);

  const updatePanelLayout = useCallback(() => {
    const button = triggerRef.current;
    if (!button) return;
    setPanelLayout(
      computeFloatingMenuLayout(
        button.getBoundingClientRect(),
        MODEL_PICKER_MENU_WIDTH_PX,
        MODEL_PICKER_MENU_MAX_HEIGHT_PX,
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
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHoveredSelection(null);
      return;
    }
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  const active = options.find((o) => o.selection === selection);
  const anyConfigured = options.some((o) => o.configured);
  const activeDisplay = active ? optionDisplay(active) : null;

  const filteredOptions = useMemo(() => {
    return options.filter((o) => {
      const display = optionDisplay(o);
      return matchesModelPickerQuery(query, {
        displayName: display.displayName,
        tier: display.tier,
        modelId: o.modelId,
        label: o.label,
        description: o.description,
      });
    });
  }, [options, query]);

  const detailOption = hoveredSelection
    ? options.find((o) => o.selection === hoveredSelection)
    : undefined;

  const openSettings = () => {
    setOpen(false);
    onNeedSettings?.();
  };

  const select = (nextSelection: string) => {
    const opt = options.find((o) => o.selection === nextSelection);
    if (!opt?.configured) {
      openSettings();
      return;
    }
    onChange(nextSelection);
    if (persistGlobalSelection) {
      storeLlmSelectionRaw(nextSelection);
      void persistActiveSelection(nextSelection);
    }
    setOpen(false);
  };

  const togglePanel = () => {
    if (ready && !anyConfigured) {
      openSettings();
      return;
    }
    setOpen((v) => !v);
  };

  const triggerTitle = active?.configured
    ? `${activeDisplay?.displayName ?? active.modelId} · ${activeDisplay?.tier ?? active.modelId}`
    : ready && !anyConfigured
      ? "尚未配置模型，点击打开设置"
      : active && !active.configured
        ? `${active.modelId} 未配置，点击打开设置`
        : "选择对话模型";

  const pickerPanel = (
    <div
      id={panelId}
      className="model-picker-panel composer-popup"
      role="dialog"
      aria-label="模型选择"
      style={
        panelLayout
          ? { maxHeight: panelLayout.maxHeight }
          : undefined
      }
      onMouseLeave={(e) => {
        const next = e.relatedTarget;
        if (
          next instanceof Node
          && e.currentTarget.contains(next)
        ) {
          return;
        }
        setHoveredSelection(null);
      }}
    >
      <div
        className="model-picker-search-wrap"
        onMouseEnter={() => setHoveredSelection(null)}
      >
        <input
          ref={searchRef}
          type="search"
          className="model-picker-search"
          placeholder="搜索模型"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="搜索模型"
        />
      </div>

      {directOverride && (
        <p className="model-picker-note">
          服务器使用 LLM_API_KEY 直连；选择仍切换各 preset 的 model/baseURL。
        </p>
      )}

      <ul className="model-picker-list" role="listbox">
        {filteredOptions.length === 0 ? (
          <li className="model-picker-empty">无匹配模型</li>
        ) : (
          filteredOptions.map((p) => {
            const display = optionDisplay(p);
            const selected = p.selection === selection;
            const showEdit = !p.configured && hoveredSelection === p.selection;
            return (
              <li
                key={p.selection}
                role="option"
                aria-selected={selected}
                className={`model-picker-row${
                  selected ? " model-picker-row--selected" : ""
                }${!p.configured ? " model-picker-row--unconfigured" : ""}`}
                onMouseEnter={() => setHoveredSelection(p.selection)}
                onMouseLeave={(e) => {
                  const row = e.currentTarget;
                  const next = e.relatedTarget;
                  if (
                    row instanceof Element
                    && next instanceof Node
                    && row
                      .closest(".model-picker-panel")
                      ?.querySelector(".model-picker-detail")
                      ?.contains(next)
                  ) {
                    return;
                  }
                  if (hoveredSelection === p.selection) {
                    setHoveredSelection(null);
                  }
                }}
              >
                <button
                  type="button"
                  className="model-picker-item"
                  onClick={() => select(p.selection)}
                >
                  <span className="model-picker-item-main">
                    <span className="model-picker-item-name">
                      {display.displayName}
                    </span>
                    <span className="model-picker-item-tier">
                      {display.tier}
                    </span>
                  </span>
                  <span className="model-picker-item-trail">
                    {selected && <CheckIcon />}
                  </span>
                </button>
                {showEdit && (
                  <button
                    type="button"
                    className="model-picker-item-edit"
                    onClick={() => openSettings()}
                  >
                    配置
                  </button>
                )}
              </li>
            );
          })
        )}
      </ul>

      <button
        type="button"
        className="model-picker-footer"
        onMouseEnter={() => setHoveredSelection(null)}
        onClick={() => openSettings()}
      >
        配置模型…
      </button>

      {detailOption && (
        <aside
          className="model-picker-detail"
          aria-label={`${optionDisplay(detailOption).displayName} 详情`}
          onMouseEnter={() => setHoveredSelection(detailOption.selection)}
          onMouseLeave={(e) => {
            const panel = e.currentTarget;
            const next = e.relatedTarget;
            if (
              panel instanceof Element
              && next instanceof Node
              && panel
                .closest(".model-picker-panel")
                ?.querySelector(".model-picker-list")
                ?.contains(next)
            ) {
              return;
            }
            setHoveredSelection(null);
          }}
        >
          {(() => {
            const display = optionDisplay(detailOption);
            return (
              <>
                <h3 className="model-picker-detail-title">
                  {display.displayName}
                </h3>
                <p className="model-picker-detail-desc">
                  {detailOption.description}
                </p>
                <p className="model-picker-detail-meta">
                  {formatContextWindow(detailOption.contextLimit)}
                </p>
                <p className="model-picker-detail-model">
                  <span className="model-picker-detail-model-label">
                    Model
                  </span>
                  <code>{detailOption.modelId}</code>
                </p>
                {!detailOption.configured && (
                  <p className="model-picker-detail-warn">
                    {detailOption.kind === "profile"
                      ? "需在设置中添加自定义配置"
                      : "当前模型 endpoint 未配置"}
                  </p>
                )}
              </>
            );
          })()}
        </aside>
      )}
    </div>
  );

  const pickerFloat =
    open && panelLayout ? (
      <div
        ref={panelRef}
        className="model-picker-float model-picker-float--portal"
        role="presentation"
        style={{
          position: "fixed",
          top: panelLayout.top,
          left: panelLayout.left,
          maxHeight: panelLayout.maxHeight,
          transform: panelLayout.transform,
          zIndex: 260,
        }}
      >
        {pickerPanel}
      </div>
    ) : null;

  return (
    <div className="model-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`model-picker-trigger${open ? " model-picker-trigger--open" : ""}${
          ready && !anyConfigured ? " model-picker-trigger--unconfigured" : ""
        }`}
        disabled={disabled || !ready}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={togglePanel}
        title={triggerTitle}
      >
        <span className="model-picker-trigger-text">
          {active?.configured && activeDisplay ? (
            <>
              <span className="model-picker-trigger-name">
                {activeDisplay.displayName}
              </span>
              <span className="model-picker-trigger-tier">
                {activeDisplay.tier}
              </span>
            </>
          ) : (
            <span className="model-picker-trigger-name">
              {ready && (!anyConfigured || (active && !active.configured))
                ? "未配置"
                : ready
                  ? "选择模型"
                  : "…"}
            </span>
          )}
        </span>
        <ChevronDownIcon />
      </button>

      {typeof document !== "undefined" && pickerFloat
        ? createPortal(pickerFloat, document.body)
        : null}
    </div>
  );
}

/** @deprecated use pickInitialLlmSelectionFromApi */
export function pickInitialLlmProvider(
  data: LlmOptionsResponse,
  storedRaw: string | undefined,
): string {
  return pickInitialLlmSelectionFromApi(data, storedRaw ?? loadStoredLlmSelectionRaw());
}

/** @deprecated use hasConfiguredLlmOption */
export function hasConfiguredLlmProvider(data: LlmOptionsResponse): boolean {
  return hasConfiguredLlmOption(data);
}

export { pickInitialLlmSelectionFromApi as pickInitialLlmSelection };
