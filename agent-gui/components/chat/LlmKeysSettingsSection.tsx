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

type PublicProfile = {
  id: string;
  title: string;
  description?: string;
  baseURL: string;
  models: string[];
  defaultModel?: string;
  hidden?: boolean;
  apiKey: ProviderKeyStatus;
};

type LlmSettingsResponse = {
  storagePath: string;
  providers: Record<LlmProviderId, ProviderConfigStatus>;
  profiles: PublicProfile[];
  activeSelection?: string;
};

type ProviderDraft = {
  apiKey: string;
  baseURL: string;
  model: string;
};

type ProfileDraft = {
  title: string;
  description: string;
  apiKey: string;
  baseURL: string;
  modelsText: string;
  defaultModel: string;
};

const EMPTY_PROFILE_DRAFT: ProfileDraft = {
  title: "",
  description: "",
  apiKey: "",
  baseURL: "https://api.openai.com/v1",
  modelsText: "",
  defaultModel: "",
};

function emptyProviderDrafts(): Partial<Record<LlmProviderId, ProviderDraft>> {
  return Object.fromEntries(
    USER_EDITABLE_PROVIDER_UI.map((spec) => [spec.id, { apiKey: "", baseURL: "", model: "" }]),
  ) as Partial<Record<LlmProviderId, ProviderDraft>>;
}

function draftsFromStatus(
  _providers: Partial<Record<LlmProviderId, ProviderConfigStatus>>,
): Partial<Record<LlmProviderId, ProviderDraft>> {
  return emptyProviderDrafts();
}

function parseModelsText(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
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
  const [savingProfileId, setSavingProfileId] = useState<string | null>(null);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedProviderId, setSavedProviderId] = useState<LlmProviderId | null>(null);
  const [savedProfileId, setSavedProfileId] = useState<string | null>(null);
  const [status, setStatus] = useState<LlmSettingsResponse | null>(null);
  const [draft, setDraft] = useState(emptyProviderDrafts);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(EMPTY_PROFILE_DRAFT);
  const [profileEdits, setProfileEdits] = useState<Record<string, ProfileDraft>>({});
  const providerRefs = useRef<Partial<Record<LlmProviderId, HTMLElement | null>>>({});
  const profilesRef = useRef<HTMLElement | null>(null);
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
      setProfileEdits({});
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
    if (!active) return;
    if (focusProviderId) {
      const el = providerRefs.current[focusProviderId];
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    profilesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      const data = (await res.json()) as LlmSettingsResponse;
      setStatus(data);
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

  const handleCreateProfile = async () => {
    setCreatingProfile(true);
    setError(null);
    setSavedProfileId(null);
    try {
      const models = parseModelsText(profileDraft.modelsText);
      const res = await fetch("/api/settings/llm-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          createProfile: {
            title: profileDraft.title,
            description: profileDraft.description || undefined,
            apiKey: profileDraft.apiKey,
            baseURL: profileDraft.baseURL,
            models,
            defaultModel: profileDraft.defaultModel || undefined,
          },
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? res.statusText);
      }
      const data = (await res.json()) as LlmSettingsResponse;
      setStatus(data);
      setProfileDraft(EMPTY_PROFILE_DRAFT);
      setSavedProfileId("new");
      window.dispatchEvent(new CustomEvent(LLM_KEYS_UPDATED_EVENT));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingProfile(false);
    }
  };

  const profileDraftFor = (profile: PublicProfile): ProfileDraft => {
    return profileEdits[profile.id] ?? {
      title: profile.title,
      description: profile.description ?? "",
      apiKey: "",
      baseURL: profile.baseURL,
      modelsText: profile.models.join("\n"),
      defaultModel: profile.defaultModel ?? profile.models[0] ?? "",
    };
  };

  const setProfileDraftFor = (profileId: string, next: ProfileDraft) => {
    setSavedProfileId(null);
    setProfileEdits((prev) => ({ ...prev, [profileId]: next }));
  };

  const handleSaveProfile = async (profile: PublicProfile) => {
    const edit = profileDraftFor(profile);
    setSavingProfileId(profile.id);
    setError(null);
    setSavedProfileId(null);
    try {
      const models = parseModelsText(edit.modelsText);
      const res = await fetch("/api/settings/llm-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updateProfile: {
            id: profile.id,
            title: edit.title,
            description: edit.description,
            baseURL: edit.baseURL,
            models,
            defaultModel: edit.defaultModel || undefined,
            ...(edit.apiKey.trim() ? { apiKey: edit.apiKey.trim() } : {}),
          },
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? res.statusText);
      }
      const data = (await res.json()) as LlmSettingsResponse;
      setStatus(data);
      setProfileEdits((prev) => {
        const next = { ...prev };
        delete next[profile.id];
        return next;
      });
      setSavedProfileId(profile.id);
      window.dispatchEvent(new CustomEvent(LLM_KEYS_UPDATED_EVENT));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingProfileId(null);
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    setSavingProfileId(profileId);
    setError(null);
    try {
      const res = await fetch("/api/settings/llm-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteProfileId: profileId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? res.statusText);
      }
      const data = (await res.json()) as LlmSettingsResponse;
      setStatus(data);
      window.dispatchEvent(new CustomEvent(LLM_KEYS_UPDATED_EVENT));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingProfileId(null);
    }
  };

  return (
    <section className="app-settings-section-block">
      <header className="app-settings-section-head app-settings-section-head--inline">
        <h2 className="app-settings-section-title">模型与 API Key</h2>
        <p className="app-settings-section-hint">
          内置 OpenAI 模型无需配置；DeepSeek 仅需 API Key。自定义 endpoint 可添加多个配置，每个配置支持同一 baseURL + Key 下的多个 model。
        </p>
      </header>

      {loading && <p className="ws-settings-muted">加载中…</p>}

      {!loading && (
        <div className="ws-settings-fields">
          {USER_EDITABLE_PROVIDER_UI.map((spec) => {
            const meta = getLlmProviderMeta(spec.id);
            const st = status?.providers[spec.id];
            const editableApiKey = spec.settingsFields.includes("apiKey");
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
              </section>
            );
          })}

          <section className="ws-settings-group" ref={profilesRef}>
            <div className="ws-settings-group-head">
              <span className="ws-settings-group-title">自定义模型配置</span>
              <span className="ws-settings-group-desc">
                每个配置包含标题、Base URL、API Key，以及同一 endpoint 下可用的多个 model id。
              </span>
            </div>

            {(status?.profiles ?? []).map((profile) => {
              const edit = profileDraftFor(profile);
              const saving = savingProfileId === profile.id;
              return (
                <div key={profile.id} className="ws-settings-subgroup">
                  <div className="ws-settings-subgroup-head">
                    <span className="ws-settings-subgroup-title">{profile.title}</span>
                    <code className="ws-settings-subgroup-id">{profile.id.slice(0, 8)}</code>
                  </div>

                  <label className="ws-settings-field">
                    <span className="ws-settings-field-label">标题</span>
                    <input
                      type="text"
                      className="ws-settings-input"
                      value={edit.title}
                      disabled={disabled || saving}
                      onChange={(e) =>
                        setProfileDraftFor(profile.id, { ...edit, title: e.target.value })
                      }
                    />
                  </label>

                  <label className="ws-settings-field">
                    <span className="ws-settings-field-label">说明</span>
                    <input
                      type="text"
                      className="ws-settings-input"
                      value={edit.description}
                      disabled={disabled || saving}
                      onChange={(e) =>
                        setProfileDraftFor(profile.id, {
                          ...edit,
                          description: e.target.value,
                        })
                      }
                    />
                  </label>

                  <label className="ws-settings-field">
                    <span className="ws-settings-field-label">Base URL</span>
                    <input
                      type="text"
                      className="ws-settings-input"
                      value={edit.baseURL}
                      disabled={disabled || saving}
                      onChange={(e) =>
                        setProfileDraftFor(profile.id, { ...edit, baseURL: e.target.value })
                      }
                    />
                  </label>

                  <label className="ws-settings-field">
                    <span className="ws-settings-field-label">Models</span>
                    <textarea
                      className="ws-settings-input ws-settings-textarea"
                      rows={3}
                      value={edit.modelsText}
                      placeholder={"gpt-4o-mini\ngpt-4o\nclaude-3-5-sonnet"}
                      disabled={disabled || saving}
                      onChange={(e) =>
                        setProfileDraftFor(profile.id, {
                          ...edit,
                          modelsText: e.target.value,
                        })
                      }
                    />
                  </label>

                  <label className="ws-settings-field">
                    <span className="ws-settings-field-label">默认 Model</span>
                    <input
                      type="text"
                      className="ws-settings-input"
                      value={edit.defaultModel}
                      placeholder={parseModelsText(edit.modelsText)[0] ?? "gpt-4o-mini"}
                      disabled={disabled || saving}
                      onChange={(e) =>
                        setProfileDraftFor(profile.id, {
                          ...edit,
                          defaultModel: e.target.value,
                        })
                      }
                    />
                  </label>

                  <label className="ws-settings-field">
                    <span className="ws-settings-field-label">API Key</span>
                    <input
                      type="password"
                      className="ws-settings-input"
                      value={edit.apiKey}
                      placeholder={
                        profile.apiKey.configured
                          ? profile.apiKey.masked ?? "已配置"
                          : "sk-…"
                      }
                      disabled={disabled || saving}
                      onChange={(e) =>
                        setProfileDraftFor(profile.id, { ...edit, apiKey: e.target.value })
                      }
                    />
                  </label>

                  <div className="ws-settings-actions">
                    <button
                      type="button"
                      className="ws-settings-save"
                      disabled={disabled || saving}
                      onClick={() => void handleSaveProfile(profile)}
                    >
                      {saving ? "保存中…" : "保存"}
                    </button>
                    <button
                      type="button"
                      className="ws-settings-action ws-settings-action--danger"
                      disabled={disabled || saving}
                      onClick={() => void handleDeleteProfile(profile.id)}
                    >
                      删除
                    </button>
                  </div>

                  {savedProfileId === profile.id && !error && (
                    <p className="ws-settings-ok">已保存</p>
                  )}
                </div>
              );
            })}

            <div className="ws-settings-subgroup ws-settings-subgroup--new">
              <div className="ws-settings-subgroup-head">
                <span className="ws-settings-subgroup-title">添加配置</span>
              </div>

              <label className="ws-settings-field">
                <span className="ws-settings-field-label">标题</span>
                <input
                  type="text"
                  className="ws-settings-input"
                  value={profileDraft.title}
                  placeholder="My Proxy"
                  disabled={disabled || creatingProfile}
                  onChange={(e) =>
                    setProfileDraft((prev) => ({ ...prev, title: e.target.value }))
                  }
                />
              </label>

              <label className="ws-settings-field">
                <span className="ws-settings-field-label">说明</span>
                <input
                  type="text"
                  className="ws-settings-input"
                  value={profileDraft.description}
                  placeholder="可选说明"
                  disabled={disabled || creatingProfile}
                  onChange={(e) =>
                    setProfileDraft((prev) => ({ ...prev, description: e.target.value }))
                  }
                />
              </label>

              <label className="ws-settings-field">
                <span className="ws-settings-field-label">Base URL</span>
                <input
                  type="text"
                  className="ws-settings-input"
                  value={profileDraft.baseURL}
                  disabled={disabled || creatingProfile}
                  onChange={(e) =>
                    setProfileDraft((prev) => ({ ...prev, baseURL: e.target.value }))
                  }
                />
              </label>

              <label className="ws-settings-field">
                <span className="ws-settings-field-label">Models</span>
                <textarea
                  className="ws-settings-input ws-settings-textarea"
                  rows={3}
                  value={profileDraft.modelsText}
                  placeholder={"gpt-4o-mini\ngpt-4o"}
                  disabled={disabled || creatingProfile}
                  onChange={(e) =>
                    setProfileDraft((prev) => ({ ...prev, modelsText: e.target.value }))
                  }
                />
              </label>

              <label className="ws-settings-field">
                <span className="ws-settings-field-label">API Key</span>
                <input
                  type="password"
                  className="ws-settings-input"
                  value={profileDraft.apiKey}
                  placeholder="sk-…"
                  disabled={disabled || creatingProfile}
                  onChange={(e) =>
                    setProfileDraft((prev) => ({ ...prev, apiKey: e.target.value }))
                  }
                />
              </label>

              <div className="ws-settings-actions">
                <button
                  type="button"
                  className="ws-settings-save"
                  disabled={disabled || creatingProfile}
                  onClick={() => void handleCreateProfile()}
                >
                  {creatingProfile ? "添加中…" : "添加配置"}
                </button>
              </div>

              {savedProfileId === "new" && !error && (
                <p className="ws-settings-ok">已添加</p>
              )}
            </div>
          </section>
        </div>
      )}

      {error && <p className="ws-settings-error">{error}</p>}

      <p className="ws-settings-footnote">
        配置保存在本机应用数据目录（`llm-secrets.json`），不会写入 `llm-config.json`。
        Agent 可通过 `llm_settings` 工具读写这些配置。
      </p>
    </section>
  );
}
