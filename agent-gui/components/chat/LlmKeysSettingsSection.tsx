"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getLlmProviderMeta,
  type LlmProviderId,
} from "@/lib/llm-providers";
import { LLM_KEYS_UPDATED_EVENT } from "@/lib/llm-settings-events";
import {
  USER_PROVIDER_UI,
  type UserSettingsField,
} from "@/lib/llm-user-providers";

type ProviderField = UserSettingsField;

type ProviderKeyStatus = {
  configured: boolean;
  masked?: string;
  source?: "local" | "builtin" | "env";
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
};

function emptyProviderDrafts(): Partial<Record<LlmProviderId, ProviderDraft>> {
  return Object.fromEntries(
    USER_PROVIDER_UI.map((spec) => [spec.id, { apiKey: "" }]),
  ) as Partial<Record<LlmProviderId, ProviderDraft>>;
}

function draftsFromStatus(
  providers: Partial<Record<LlmProviderId, ProviderConfigStatus>>,
): Partial<Record<LlmProviderId, ProviderDraft>> {
  return Object.fromEntries(
    USER_PROVIDER_UI.map((spec) => [spec.id, { apiKey: "" }]),
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
  disabled?: boolean;
};

export function LlmKeysSettingsSection({
  active,
  disabled = false,
}: LlmKeysSettingsSectionProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState<LlmSettingsResponse | null>(null);
  const [draft, setDraft] = useState(emptyProviderDrafts);
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
    if (touched.size === 0) return;
    setSaving(true);
    setError(null);
    setSaved(false);

    const providers: Partial<
      Record<LlmProviderId, Partial<Record<ProviderField, string>>>
    > = {};

    for (const [id, fields] of touched) {
      const entry: Partial<Record<ProviderField, string>> = {};
      if (fields.has("apiKey")) entry.apiKey = draft[id]?.apiKey ?? "";
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

  return (
    <section className="app-settings-section-block">
      <header className="app-settings-section-head">
        <h2 className="app-settings-section-title">模型与 API Key</h2>
        <p className="app-settings-section-hint">
          默认使用 OpenAI；可选填 DeepSeek 官方 Key
        </p>
      </header>

      {loading && <p className="ws-settings-muted">加载中…</p>}

      {!loading && (
        <div className="ws-settings-fields">
          {USER_PROVIDER_UI.map((spec) => {
            const meta = getLlmProviderMeta(spec.id);
            const st = status?.providers[spec.id];
            const editableApiKey = spec.settingsFields.includes("apiKey");

            return (
              <section key={spec.id} className="ws-settings-group">
                <div className="ws-settings-group-head">
                  <span className="ws-settings-group-title">{meta.label}</span>
                  <span className="ws-settings-group-desc">{meta.description}</span>
                </div>

                <div className="ws-settings-readonly-row">
                  <span className="ws-settings-field-label">Model</span>
                  <span className="ws-settings-readonly-value">
                    {st?.model ?? meta.defaultModel}
                  </span>
                </div>

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
                      disabled={disabled || saving}
                      onChange={(e) => {
                        markTouched(spec.id, "apiKey");
                        setDraft((prev) => ({
                          ...prev,
                          [spec.id]: { apiKey: e.target.value },
                        }));
                      }}
                    />
                  </label>
                )}
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
          disabled={disabled || saving || loading || touched.size === 0}
          onClick={() => void handleSave()}
        >
          {saving ? "保存中…" : "保存 API Key"}
        </button>
      </div>

      <p className="ws-settings-footnote">
        API Key 保存在本机应用数据目录，不会写入 llm-config.json。留空并保存可清除
        DeepSeek Key。
      </p>
    </section>
  );
}
