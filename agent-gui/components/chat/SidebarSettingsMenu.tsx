"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SettingsGearIcon } from "@/components/SettingsGearIcon";
import {
  LLM_PROVIDER_LIST,
  type LlmProviderId,
} from "@/lib/llm-providers";

export const LLM_KEYS_UPDATED_EVENT = "agent-gui:llm-keys-updated";

type ProviderField = "baseURL" | "apiKey" | "model";

type ProviderKeyStatus = {
  configured: boolean;
  masked?: string;
  source?: "local" | "config" | "env";
};

type ProviderConfigStatus = {
  baseURL: string;
  model: string;
  defaultBaseURL: string;
  defaultModel: string;
  apiKey: ProviderKeyStatus;
};

type LlmSettingsResponse = {
  configPath: string;
  providers: Record<LlmProviderId, ProviderConfigStatus>;
};

type ProviderDraft = {
  baseURL: string;
  apiKey: string;
  model: string;
};

function emptyProviderDrafts(): Record<LlmProviderId, ProviderDraft> {
  return Object.fromEntries(
    LLM_PROVIDER_LIST.map((p) => [p.id, { baseURL: "", apiKey: "", model: "" }]),
  ) as Record<LlmProviderId, ProviderDraft>;
}

function draftsFromStatus(
  providers: Record<LlmProviderId, ProviderConfigStatus>,
): Record<LlmProviderId, ProviderDraft> {
  return Object.fromEntries(
    LLM_PROVIDER_LIST.map((p) => [
      p.id,
      {
        baseURL: providers[p.id]?.baseURL ?? "",
        apiKey: "",
        model: providers[p.id]?.model ?? "",
      },
    ]),
  ) as Record<LlmProviderId, ProviderDraft>;
}

function apiKeyStatusLabel(status: ProviderKeyStatus | undefined): string {
  if (!status?.configured) return "未配置";
  if (status.source === "local") return `已保存 ${status.masked ?? ""}`.trim();
  if (status.source === "config") return status.masked ?? "已配置";
  return "使用 .env.local";
}

type SidebarSettingsMenuProps = {
  disabled?: boolean;
};

export function SidebarSettingsMenu({ disabled = false }: SidebarSettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState<LlmSettingsResponse | null>(null);
  const [draft, setDraft] = useState(emptyProviderDrafts);
  const [touched, setTouched] = useState<Map<LlmProviderId, Set<ProviderField>>>(
    () => new Map(),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/llm-keys", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = (await res.json()) as LlmSettingsResponse;
      setStatus(data);
      setDraft(draftsFromStatus(data.providers));
      setTouched(new Map());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadSettings();
  }, [open, loadSettings]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const markTouched = (id: LlmProviderId, field: ProviderField) => {
    setSaved(false);
    setTouched((prev) => {
      const next = new Map(prev);
      const fields = new Set(next.get(id) ?? []);
      fields.add(field);
      next.set(id, fields);
      return next;
    });
  };

  const handleSave = async () => {
    if (touched.size === 0) {
      setOpen(false);
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);

    const providers: Partial<
      Record<LlmProviderId, Partial<Record<ProviderField, string>>>
    > = {};

    for (const [id, fields] of touched) {
      const entry: Partial<Record<ProviderField, string>> = {};
      if (fields.has("baseURL")) entry.baseURL = draft[id].baseURL;
      if (fields.has("apiKey")) entry.apiKey = draft[id].apiKey;
      if (fields.has("model")) entry.model = draft[id].model;
      providers[id] = entry;
    }

    try {
      const res = await fetch("/api/settings/llm-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providers }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? res.statusText);
      }
      const data = (await res.json()) as {
        providers: LlmSettingsResponse["providers"];
      };
      setStatus((prev) =>
        prev ? { ...prev, providers: data.providers } : prev,
      );
      setDraft(draftsFromStatus(data.providers));
      setTouched(new Map());
      setSaved(true);
      window.dispatchEvent(new CustomEvent(LLM_KEYS_UPDATED_EVENT));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const close = useCallback(() => setOpen(false), []);

  const settingsDialog = open ? (
    <div className="ws-settings-overlay">
      <button
        type="button"
        className="ws-settings-backdrop"
        aria-label="关闭设置"
        onClick={close}
      />
      <div
        id={panelId}
        className="ws-settings-panel"
        role="dialog"
        aria-label="设置"
        aria-modal="true"
      >
        <div className="ws-settings-head">
          <div className="ws-settings-head-text">
            <span className="ws-settings-title">LLM 配置</span>
            <span className="ws-settings-hint">每组：Base URL · API Key · 模型名</span>
          </div>
          <button
            type="button"
            className="ws-settings-close"
            aria-label="关闭"
            onClick={close}
          >
            ×
          </button>
        </div>

        {loading && <p className="ws-settings-muted">加载中…</p>}

        {!loading && (
          <div className="ws-settings-fields">
            {LLM_PROVIDER_LIST.map((provider) => {
              const st = status?.providers[provider.id];
              return (
                <section key={provider.id} className="ws-settings-group">
                  <div className="ws-settings-group-head">
                    <span className="ws-settings-group-title">
                      {provider.label}
                    </span>
                    <span className="ws-settings-group-desc">
                      {provider.description}
                    </span>
                  </div>

                  <label className="ws-settings-field">
                    <span className="ws-settings-field-label">Base URL</span>
                    <input
                      type="url"
                      className="ws-settings-input"
                      value={draft[provider.id].baseURL}
                      placeholder={st?.defaultBaseURL ?? "https://…/v1"}
                      autoComplete="off"
                      disabled={disabled || saving}
                      onChange={(e) => {
                        markTouched(provider.id, "baseURL");
                        setDraft((prev) => ({
                          ...prev,
                          [provider.id]: {
                            ...prev[provider.id],
                            baseURL: e.target.value,
                          },
                        }));
                      }}
                    />
                  </label>

                  <label className="ws-settings-field">
                    <span className="ws-settings-field-label">API Key</span>
                    <span className="ws-settings-field-status">
                      {apiKeyStatusLabel(st?.apiKey)}
                    </span>
                    <input
                      type="password"
                      className="ws-settings-input"
                      value={draft[provider.id].apiKey}
                      placeholder={
                        st?.apiKey.configured && !draft[provider.id].apiKey
                          ? st.apiKey.masked ?? "已配置"
                          : "sk-…"
                      }
                      autoComplete="off"
                      disabled={disabled || saving}
                      onChange={(e) => {
                        markTouched(provider.id, "apiKey");
                        setDraft((prev) => ({
                          ...prev,
                          [provider.id]: {
                            ...prev[provider.id],
                            apiKey: e.target.value,
                          },
                        }));
                      }}
                    />
                  </label>

                  <label className="ws-settings-field">
                    <span className="ws-settings-field-label">Model</span>
                    <input
                      type="text"
                      className="ws-settings-input"
                      value={draft[provider.id].model}
                      placeholder={st?.defaultModel ?? "model-id"}
                      autoComplete="off"
                      disabled={disabled || saving}
                      onChange={(e) => {
                        markTouched(provider.id, "model");
                        setDraft((prev) => ({
                          ...prev,
                          [provider.id]: {
                            ...prev[provider.id],
                            model: e.target.value,
                          },
                        }));
                      }}
                    />
                  </label>
                </section>
              );
            })}
          </div>
        )}

        {error && <p className="ws-settings-error">{error}</p>}
        {saved && !error && <p className="ws-settings-ok">已保存</p>}

        <div className="ws-settings-actions">
          <button
            type="button"
            className="ws-settings-save"
            disabled={disabled || saving || loading}
            onClick={() => void handleSave()}
          >
            {saving ? "保存中…" : "保存"}
          </button>
        </div>

        <p className="ws-settings-footnote">
          写入 <code>llm-config.json</code>，保存后立即生效。API Key 留空并保存可清除；Base
          URL / Model 留空则恢复默认值。
        </p>
      </div>
    </div>
  ) : null;

  return (
    <div className="ws-settings" ref={rootRef}>
      <button
        type="button"
        className={`ws-icon-btn ws-settings-trigger${open ? " ws-settings-trigger--open" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        title="设置"
        onClick={() => setOpen((v) => !v)}
      >
        <SettingsGearIcon size={16} />
      </button>
      {typeof document !== "undefined" && settingsDialog
        ? createPortal(settingsDialog, document.body)
        : null}
    </div>
  );
}
