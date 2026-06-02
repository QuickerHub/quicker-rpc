"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  DEEPSEEK_PROVIDER_ID,
  type LlmProviderId,
} from "@/lib/llm-providers";
import {
  formatContextWindow,
  getModelPickerDisplay,
  matchesModelPickerQuery,
} from "@/lib/model-picker-display";
import { LLM_KEYS_UPDATED_EVENT } from "@/lib/llm-settings-events";
import { storeLlmProvider } from "@/lib/llm-prefs";

type LlmProviderOption = {
  id: LlmProviderId;
  label: string;
  description: string;
  modelId: string;
  configured: boolean;
  contextLimit: number;
  contextLimitSource?: "env" | "catalog" | "pattern" | "default";
};

type LlmApiResponse = {
  defaultProvider: LlmProviderId;
  activeProvider: LlmProviderId;
  providers: LlmProviderOption[];
  directOverride?: boolean;
};

type ModelSelectorProps = {
  providerId: LlmProviderId;
  onChange: (id: LlmProviderId) => void;
  onNeedSettings?: (targetProviderId?: LlmProviderId) => void;
  disabled?: boolean;
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

export function hasConfiguredLlmProvider(data: LlmApiResponse): boolean {
  return data.providers.some((p) => p.configured);
}

export function pickInitialLlmProvider(
  data: LlmApiResponse,
  stored: LlmProviderId | undefined,
): LlmProviderId {
  const configured = data.providers.filter((p) => p.configured);
  if (stored && configured.some((p) => p.id === stored)) return stored;
  if (configured.some((p) => p.id === data.activeProvider)) {
    return data.activeProvider;
  }
  if (configured.some((p) => p.id === data.defaultProvider)) {
    return data.defaultProvider;
  }
  return configured[0]?.id ?? data.defaultProvider;
}

export async function fetchLlmOptions(): Promise<LlmApiResponse | null> {
  const res = await fetch("/api/llm");
  if (!res.ok) return null;
  return (await res.json()) as LlmApiResponse;
}

export function ModelSelector({
  providerId,
  onChange,
  onNeedSettings,
  disabled,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hoveredId, setHoveredId] = useState<LlmProviderId | null>(null);
  const [options, setOptions] = useState<LlmProviderOption[]>([]);
  const [ready, setReady] = useState(false);
  const [directOverride, setDirectOverride] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const panelId = useId();

  const refreshOptions = useCallback(async () => {
    const data = await fetchLlmOptions();
    if (!data) return;
    setOptions(data.providers);
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

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setHoveredId(null);
      return;
    }
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  const active = options.find((p) => p.id === providerId);
  const anyConfigured = options.some((p) => p.configured);
  const activeDisplay = active
    ? getModelPickerDisplay(active.id, active.modelId)
    : null;

  const filteredOptions = useMemo(() => {
    return options.filter((p) => {
      const display = getModelPickerDisplay(p.id, p.modelId);
      return matchesModelPickerQuery(query, {
        displayName: display.displayName,
        tier: display.tier,
        modelId: p.modelId,
        label: p.label,
        description: p.description,
      });
    });
  }, [options, query]);

  const detailOption = hoveredId
    ? options.find((p) => p.id === hoveredId)
    : undefined;

  const openSettings = (targetProviderId?: LlmProviderId) => {
    setOpen(false);
    onNeedSettings?.(targetProviderId);
  };

  const select = (id: LlmProviderId) => {
    const opt = options.find((p) => p.id === id);
    if (!opt?.configured) {
      openSettings(id);
      return;
    }
    onChange(id);
    storeLlmProvider(id);
    setOpen(false);
  };

  const togglePanel = () => {
    if (ready && !anyConfigured) {
      openSettings(providerId);
      return;
    }
    setOpen((v) => !v);
  };

  const triggerTitle = active?.configured
    ? `${activeDisplay?.displayName ?? active.modelId}（${active.label}）`
    : ready && !anyConfigured
      ? "尚未配置模型，点击打开设置"
      : active && !active.configured
        ? `${active.modelId} 未配置，点击打开设置`
        : "选择对话模型";

  return (
    <div className="model-picker" ref={rootRef}>
      <button
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

      {open && (
        <div className="model-picker-float" role="presentation">
          <div
            id={panelId}
            className="model-picker-panel composer-popup"
            role="dialog"
            aria-label="模型选择"
            onMouseLeave={(e) => {
              const next = e.relatedTarget;
              if (
                next instanceof Node
                && e.currentTarget.contains(next)
              ) {
                return;
              }
              setHoveredId(null);
            }}
          >
            <div
              className="model-picker-search-wrap"
              onMouseEnter={() => setHoveredId(null)}
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
                  const display = getModelPickerDisplay(p.id, p.modelId);
                  const selected = p.id === providerId;
                  const showEdit = !p.configured && hoveredId === p.id;
                  return (
                    <li
                      key={p.id}
                      role="option"
                      aria-selected={selected}
                      className={`model-picker-row${
                        selected ? " model-picker-row--selected" : ""
                      }${!p.configured ? " model-picker-row--unconfigured" : ""}`}
                      onMouseEnter={() => setHoveredId(p.id)}
                      onMouseLeave={(e) => {
                        const next = e.relatedTarget;
                        if (
                          next instanceof Node
                          && e.currentTarget
                            .closest(".model-picker-panel")
                            ?.querySelector(".model-picker-detail")
                            ?.contains(next)
                        ) {
                          return;
                        }
                        if (hoveredId === p.id) setHoveredId(null);
                      }}
                    >
                      <button
                        type="button"
                        className="model-picker-item"
                        onClick={() => select(p.id)}
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
                          onClick={() => openSettings(p.id)}
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
              onMouseEnter={() => setHoveredId(null)}
              onClick={() => openSettings(providerId)}
            >
              配置模型…
            </button>

            {detailOption && (
              <aside
                className="model-picker-detail"
                aria-label={`${getModelPickerDisplay(detailOption.id, detailOption.modelId).displayName} 详情`}
                onMouseEnter={() => setHoveredId(detailOption.id)}
                onMouseLeave={(e) => {
                  const next = e.relatedTarget;
                  if (
                    next instanceof Node
                    && e.currentTarget
                      .closest(".model-picker-panel")
                      ?.querySelector(".model-picker-list")
                      ?.contains(next)
                  ) {
                    return;
                  }
                  setHoveredId(null);
                }}
              >
                {(() => {
                  const display = getModelPickerDisplay(
                    detailOption.id,
                    detailOption.modelId,
                  );
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
                          {detailOption.id === DEEPSEEK_PROVIDER_ID
                            ? "需在设置中填写 DeepSeek API Key"
                            : "需在设置或 llm-config.json 中配置"}
                        </p>
                      )}
                    </>
                  );
                })()}
              </aside>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
