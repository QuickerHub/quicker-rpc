"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  formatModelShortLabel,
  type LlmProviderId,
} from "@/lib/llm-providers";
import { LLM_KEYS_UPDATED_EVENT } from "@/components/chat/SidebarSettingsMenu";
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
  disabled?: boolean;
};

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
  disabled,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<LlmProviderOption[]>([]);
  const [ready, setReady] = useState(false);
  const [directOverride, setDirectOverride] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
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

  const active = options.find((p) => p.id === providerId);
  const triggerLabel = active
    ? formatModelShortLabel(active.modelId)
    : ready
      ? "模型"
      : "…";

  const select = (id: LlmProviderId) => {
    const opt = options.find((p) => p.id === id);
    if (!opt?.configured) return;
    onChange(id);
    storeLlmProvider(id);
    setOpen(false);
  };

  return (
    <div className="tool-selector model-selector" ref={rootRef}>
      <button
        type="button"
        className={`tool-selector-trigger${open ? " tool-selector-trigger--active" : ""}`}
        disabled={disabled || !ready}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        title={
          active
            ? `${active.modelId} · ${active.description}`
            : "选择对话模型"
        }
      >
        模型
        <span className="tool-selector-count">{triggerLabel}</span>
      </button>

      {open && (
        <div
          id={panelId}
          className="composer-popup tool-selector-panel"
          role="dialog"
          aria-label="模型选择"
        >
          <div className="tool-selector-header">
            <span>对话模型</span>
          </div>
          {directOverride && (
            <p className="composer-popup-note">
              服务器使用 LLM_API_KEY 直连；下方选择仍切换各 preset 的 model/baseURL。
            </p>
          )}
          <ul className="model-selector-list">
            {options.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={`model-selector-item${
                    p.id === providerId ? " model-selector-item--active" : ""
                  }${!p.configured ? " model-selector-item--disabled" : ""}`}
                  disabled={!p.configured}
                  aria-label={`${p.modelId}，${p.description}`}
                  onClick={() => select(p.id)}
                >
                  <span className="model-selector-item-radio" aria-hidden />
                  <span className="model-selector-item-body">
                    <span className="model-selector-item-label">{p.modelId}</span>
                    <span className="model-selector-item-desc">{p.description}</span>
                    {!p.configured && (
                      <span className="model-selector-item-warn">
                        未配置 API Key（见 llm-config.json）
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
