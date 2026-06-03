"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getLlmProviderMeta,
  type LlmProviderId,
} from "@/lib/llm-providers";
import { LLM_KEYS_UPDATED_EVENT } from "@/lib/llm-settings-events";
import {
  USER_EDITABLE_PROVIDER_UI,
  type UserSettingsField,
} from "@/lib/llm-user-providers";

type ProviderField = UserSettingsField;

type ProviderKeyStatus = {
  configured: boolean;
  masked?: string;
  source?: "local" | "builtin" | "bundled" | "env";
};

type ProviderConfigStatus = {
  baseURL: string;
  model: string;
  defaultBaseURL: string;
  defaultModel: string;
  apiKey: ProviderKeyStatus;
  editableFields: readonly ProviderField[];
};

type LlmSettingsResponse = {
  storagePath: string;
  providers: Record<LlmProviderId, ProviderConfigStatus>;
};

type ProviderDraft = {
  apiKey: string;
  baseURL: string;
  model: string;
};

function emptyProviderDrafts(): Partial<Record<LlmProviderId, ProviderDraft>> {
  return Object.fromEntries(
    USER_EDITABLE_PROVIDER_UI.map((spec) => [spec.id, { apiKey: "", baseURL: "", model: "" }]),
  ) as Partial<Record<LlmProviderId, ProviderDraft>>;
}

function draftsFromStatus(
  providers: Partial<Record<LlmProviderId, ProviderConfigStatus>>,
): Partial<Record<LlmProviderId, ProviderDraft>> {
  return Object.fromEntries(
    USER_EDITABLE_PROVIDER_UI.map((spec) => [
      spec.id,
      {
        apiKey: "",
        // Do not prefill Base URL in UI; keep defaults opaque to end users.
        baseURL: "",
        // Do not prefill Model in UI; keep defaults opaque to end users.
        model: "",
      },
    ]),
  ) as Partial<Record<LlmProviderId, ProviderDraft>>;
}

function apiKeyStatusLabel(status: ProviderKeyStatus | undefined): string {
  if (!status?.configured) return "未配置";
  if (status.source === "local") return `已保存 ${status.masked ?? ""}`.trim();
  if (status.source === "builtin") return "已就绪";
  if (status.source === "env") return "使用环境变量";
  return "已配置";
}

type LlmKeysSettingsSectionProps = {
  active: boolean;
  focusProviderId?: LlmProviderId;
  disabled?: boolean;
};

export function LlmKeysSettingsSection({
  active,
  focusProviderId,
  disabled = false,
}: LlmKeysSettingsSectionProps) {
  const [loading, setLoading] = useState(false);
  const [savingProviderId, setSavingProviderId] = useState<LlmProviderId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedProviderId, setSavedProviderId] = useState<LlmProviderId | null>(null);
  const [status, setStatus] = useState<LlmSettingsResponse | null>(null);
  const [draft, setDraft] = useState(emptyProviderDrafts);
  const providerRefs = useRef<Partial<Record<LlmProviderId, HTMLElement | null>>>(
    {},
  );
  const [touched, setTouched] = useState<Map<LlmProviderId, Set<ProviderField>>>(
    () => new Map(),
  );

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
    if (!active) return;
    void loadSettings();
  }, [active, loadSettings]);

  useEffect(() => {
    if (!active || !focusProviderId) return;
    const el = providerRefs.current[focusProviderId];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [active, focusProviderId, status]);

  const markTouched = (id: LlmProviderId, field: ProviderField) => {
    setSavedProviderId(null);
    setTouched((prev) => {
      const next = new Map(prev);
      const fields = new Set(next.get(id) ?? []);
      fields.add(field);
      next.set(id, fields);
      return next;
    });
  };

  const handleSaveProvider = async (id: LlmProviderId) => {
    const fields = touched.get(id);
    if (!fields || fields.size === 0) return;
    setSavingProviderId(id);
    setError(null);
    setSavedProviderId(null);

    const providers: Partial<
      Record<LlmProviderId, Partial<Record<ProviderField, string>>>
    > = {};

    const entry: Partial<Record<ProviderField, string>> = {};
    if (fields.has("apiKey")) entry.apiKey = draft[id]?.apiKey ?? "";
    if (fields.has("baseURL")) entry.baseURL = draft[id]?.baseURL ?? "";
    if (fields.has("model")) entry.model = draft[id]?.model ?? "";
    providers[id] = entry;

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
      setDraft((prev) => ({
        ...prev,
        [id]: { apiKey: "", baseURL: "", model: "" },
      }));
      setTouched((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setSavedProviderId(id);
      window.dispatchEvent(new CustomEvent(LLM_KEYS_UPDATED_EVENT));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingProviderId(null);
    }
  };

  return (
    <section className="app-settings-section-block">
      <header className="app-settings-section-head app-settings-section-head--inline">
        <h2 className="app-settings-section-title">模型与 API Key</h2>
        <p className="app-settings-section-hint">
          DeepSeek 仅需 API Key；自定义模型可改 Model / Base URL。默认 OpenAI 模型无需配置。
        </p>
      </header>

      {loading && <p className="ws-settings-muted">加载中…</p>}

      {!loading && (
        <div className="ws-settings-fields">
          {USER_EDITABLE_PROVIDER_UI.map((spec) => {
            const meta = getLlmProviderMeta(spec.id);
            const st = status?.providers[spec.id];
            const editableApiKey = spec.settingsFields.includes("apiKey");
            const editableBaseURL = spec.settingsFields.includes("baseURL");
            const editableModel = spec.settingsFields.includes("model");
            const hasEditableFields = editableApiKey || editableBaseURL || editableModel;
            const panelTouched = (touched.get(spec.id)?.size ?? 0) > 0;
            const panelSaving = savingProviderId === spec.id;

            return (
              <section
                key={spec.id}
                className="ws-settings-group"
                ref={(el) => {
                  providerRefs.current[spec.id] = el;
                }}
              >
                <div className="ws-settings-group-head">
                  <span className="ws-settings-group-title">{meta.label}</span>
                  <span className="ws-settings-group-desc">{meta.description}</span>
                </div>

                {editableModel ? (
                  <label className="ws-settings-field">
                    <span className="ws-settings-field-label">Model</span>
                    <input
                      type="text"
                      className="ws-settings-input"
                      value={draft[spec.id]?.model ?? ""}
                      placeholder="gpt-4o-mini"
                      autoComplete="off"
                      disabled={disabled || Boolean(savingProviderId)}
                      onChange={(e) => {
                        markTouched(spec.id, "model");
                        setDraft((prev) => ({
                          ...prev,
                          [spec.id]: {
                            apiKey: prev[spec.id]?.apiKey ?? "",
                            baseURL: prev[spec.id]?.baseURL ?? "",
                            model: e.target.value,
                          },
                        }));
                      }}
                    />
                  </label>
                ) : (
                  <div className="ws-settings-readonly-row">
                    <span className="ws-settings-field-label">Model</span>
                    <span className="ws-settings-readonly-value">
                      {st?.model ?? meta.defaultModel}
                    </span>
                  </div>
                )}

                {editableBaseURL && (
                  <label className="ws-settings-field">
                    <span className="ws-settings-field-label">Base URL</span>
                    <input
                      type="text"
                      className="ws-settings-input"
                      value={draft[spec.id]?.baseURL ?? ""}
                      placeholder="https://api.openai.com/v1"
                      autoComplete="off"
                      disabled={disabled || Boolean(savingProviderId)}
                      onChange={(e) => {
                        markTouched(spec.id, "baseURL");
                        setDraft((prev) => ({
                          ...prev,
                          [spec.id]: {
                            apiKey: prev[spec.id]?.apiKey ?? "",
                            baseURL: e.target.value,
                            model: prev[spec.id]?.model ?? "",
                          },
                        }));
                      }}
                    />
                  </label>
                )}

                <div className="ws-settings-readonly-row">
                  <span className="ws-settings-field-label">状态</span>
                  <span className="ws-settings-readonly-value">
                    {apiKeyStatusLabel(st?.apiKey)}
                  </span>
                </div>

                {editableApiKey && (
                  <label className="ws-settings-field">
                    <span className="ws-settings-field-label">API Key</span>
                    <input
                      type="password"
                      className="ws-settings-input"
                      value={draft[spec.id]?.apiKey ?? ""}
                      placeholder={
                        st?.apiKey.configured && !draft[spec.id]?.apiKey
                          ? st.apiKey.masked ?? "已配置"
                          : "sk-…"
                      }
                      autoComplete="off"
                      disabled={disabled || Boolean(savingProviderId)}
                      onChange={(e) => {
                        markTouched(spec.id, "apiKey");
                        setDraft((prev) => ({
                          ...prev,
                          [spec.id]: {
                            apiKey: e.target.value,
                            baseURL: prev[spec.id]?.baseURL ?? "",
                            model: prev[spec.id]?.model ?? "",
                          },
                        }));
                      }}
                    />
                  </label>
                )}

                {hasEditableFields && (
                  <>
                    <div className="ws-settings-actions">
                      <button
                        type="button"
                        className="ws-settings-save"
                        disabled={
                          disabled
                          || loading
                          || Boolean(savingProviderId)
                          || !panelTouched
                        }
                        onClick={() => void handleSaveProvider(spec.id)}
                      >
                        {panelSaving ? "保存中…" : "保存配置"}
                      </button>
                    </div>

                    {savedProviderId === spec.id && !error && (
                      <p className="ws-settings-ok">已保存</p>
                    )}
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}

      {error && <p className="ws-settings-error">{error}</p>}

      <p className="ws-settings-footnote">
        Model、API Key 与 Base URL 保存在本机应用数据目录，不会写入 `llm-config.json`。
        输入框留空并保存将恢复系统默认值。
      </p>
    </section>
  );
}
