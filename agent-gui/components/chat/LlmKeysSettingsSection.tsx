"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BuiltinModelSponsorLine } from "@/components/chat/BuiltinModelSponsorLine";
import { ProfileBaseUrlField } from "@/components/chat/ProfileBaseUrlField";
import {
  getLlmProviderMeta,
  type LlmProviderId,
} from "@/lib/llm-providers";
import type { LlmBuiltinSponsor } from "@/lib/llm-builtin-sponsors";
import { resolveBuiltinSponsor } from "@/lib/llm-builtin-sponsors";
import { LLM_KEYS_UPDATED_EVENT } from "@/lib/llm-settings-events";
import { USER_MODEL_SELECTOR_IDS } from "@/lib/llm-user-providers";

type ProviderKeyStatus = {
  configured: boolean;
  masked?: string;
  source?: "local" | "builtin" | "bundled" | "env";
};

type ProviderConfigStatus = {
  model: string;
  defaultModel: string;
  apiKey: ProviderKeyStatus;
  editableFields: readonly string[];
  /** Omitted for built-in presets (endpoint URL is not user-facing). */
  baseURL?: string;
  defaultBaseURL?: string;
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

type BuiltinGroupDisplayRow = {
  id: string;
  providerId: LlmProviderId;
  label: string;
  model: string;
  sponsor?: LlmBuiltinSponsor;
  endpointCount: number;
};

type RemotePublishConfigStatus = {
  cached: boolean;
  refreshing: boolean;
  fetchedAt: string;
  sourceUrl: string;
  endpointCount: number;
};

type LlmSettingsResponse = {
  storagePath: string;
  sponsors?: Partial<Record<LlmProviderId, LlmBuiltinSponsor>>;
  providers: Record<LlmProviderId, ProviderConfigStatus>;
  profiles: PublicProfile[];
  activeSelection?: string;
  builtinGroups?: BuiltinGroupDisplayRow[];
  remotePublishConfig?: RemotePublishConfigStatus;
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

function parseModelsText(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

type BuiltinProviderProbe = {
  checking: boolean;
  configured?: boolean;
  reachable?: boolean;
  message?: string;
  latencyMs?: number;
};

type LlmBuiltinProbeResponse = {
  ok: boolean;
  mode?: "groups" | "merged";
  groups?: Record<
    string,
    {
      configured: boolean;
      reachable: boolean;
      message?: string;
      latencyMs?: number;
    }
  >;
  providers?: Record<
    string,
    {
      configured: boolean;
      reachable: boolean;
      message?: string;
      latencyMs?: number;
    }
  >;
};

function builtinProbeLabel(
  keyStatus: ProviderKeyStatus | undefined,
  probe: BuiltinProviderProbe | undefined,
): string {
  if (!keyStatus?.configured) return "未配置";
  if (keyStatus.source === "local") {
    return `已保存 ${keyStatus.masked ?? ""}`.trim();
  }
  if (probe?.checking) return "检测中…";
  if (probe?.reachable) {
    return probe.latencyMs != null ? `可用 · ${probe.latencyMs}ms` : "可用";
  }
  if (probe?.reachable === false) return "不可用";
  if (keyStatus.source === "env") return "环境变量";
  return "检测中…";
}

function builtinProbeBadgeClass(
  configured: boolean,
  probe: BuiltinProviderProbe | undefined,
): string {
  if (!configured) return "";
  if (probe?.checking || probe?.reachable === undefined) {
    return " llm-config-list-badge--loading";
  }
  if (probe.reachable) return " llm-config-list-badge--ok";
  return " llm-config-list-badge--err";
}

function builtinProbeDotClass(
  configured: boolean,
  probe: BuiltinProviderProbe | undefined,
): string {
  if (!configured) return "";
  if (probe?.checking || probe?.reachable === undefined) return " loading";
  if (probe.reachable) return " ok";
  return " err";
}

function apiKeyStatusLabel(status: ProviderKeyStatus | undefined): string {
  if (!status?.configured) return "未配置";
  if (status.source === "local") return `已保存 ${status.masked ?? ""}`.trim();
  if (status.source === "env") return "环境变量";
  return "已配置";
}

function formatProfileModelsSummary(profile: PublicProfile): string {
  const models = profile.models;
  if (!models.length) return "无 model";
  const head = models.slice(0, 2).join(", ");
  if (models.length <= 2) return head;
  return `${head} 等 ${models.length} 个`;
}

type ProfileEditorFieldsProps = {
  edit: ProfileDraft;
  onChange: (next: ProfileDraft) => void;
  disabled: boolean;
  keyStatus?: ProviderKeyStatus;
  idPrefix: string;
};

function ProfileEditorFields({
  edit,
  onChange,
  disabled,
  keyStatus,
  idPrefix,
}: ProfileEditorFieldsProps) {
  const set = (patch: Partial<ProfileDraft>) => onChange({ ...edit, ...patch });
  const modelOptions = parseModelsText(edit.modelsText);

  return (
    <>
      <label className="ws-settings-field" htmlFor={`${idPrefix}-title`}>
        <span className="ws-settings-field-label">标题</span>
        <input
          id={`${idPrefix}-title`}
          type="text"
          className="ws-settings-input"
          value={edit.title}
          disabled={disabled}
          onChange={(e) => set({ title: e.target.value })}
        />
      </label>

      <label className="ws-settings-field" htmlFor={`${idPrefix}-description`}>
        <span className="ws-settings-field-label">说明</span>
        <input
          id={`${idPrefix}-description`}
          type="text"
          className="ws-settings-input"
          value={edit.description}
          placeholder="可选说明"
          disabled={disabled}
          onChange={(e) => set({ description: e.target.value })}
        />
      </label>

      <ProfileBaseUrlField
        idPrefix={idPrefix}
        value={edit.baseURL}
        disabled={disabled}
        onChange={(baseURL) => set({ baseURL })}
      />

      <label className="ws-settings-field" htmlFor={`${idPrefix}-models`}>
        <span className="ws-settings-field-label">Models</span>
        <textarea
          id={`${idPrefix}-models`}
          className="ws-settings-input ws-settings-textarea"
          rows={3}
          value={edit.modelsText}
          placeholder={"gpt-4o-mini\ngpt-4o\nclaude-3-5-sonnet"}
          disabled={disabled}
          onChange={(e) => set({ modelsText: e.target.value })}
        />
      </label>

      <label className="ws-settings-field" htmlFor={`${idPrefix}-defaultModel`}>
        <span className="ws-settings-field-label">默认 Model</span>
        {modelOptions.length > 0 ? (
          <select
            id={`${idPrefix}-defaultModel`}
            className="ws-settings-input"
            value={edit.defaultModel || modelOptions[0]}
            disabled={disabled}
            onChange={(e) => set({ defaultModel: e.target.value })}
          >
            {modelOptions.map((modelId) => (
              <option key={modelId} value={modelId}>
                {modelId}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={`${idPrefix}-defaultModel`}
            type="text"
            className="ws-settings-input"
            value={edit.defaultModel}
            placeholder="gpt-4o-mini"
            disabled={disabled}
            onChange={(e) => set({ defaultModel: e.target.value })}
          />
        )}
      </label>

      <label className="ws-settings-field" htmlFor={`${idPrefix}-apiKey`}>
        <span className="ws-settings-field-label">API Key</span>
        <input
          id={`${idPrefix}-apiKey`}
          type="password"
          className="ws-settings-input"
          value={edit.apiKey}
          placeholder={
            keyStatus?.configured && !edit.apiKey
              ? keyStatus.masked ?? "已配置（留空保持不变）"
              : "sk-…"
          }
          autoComplete="off"
          disabled={disabled}
          onChange={(e) => set({ apiKey: e.target.value })}
        />
      </label>
    </>
  );
}

function splitRowProbeLabel(probe: BuiltinProviderProbe | undefined): string {
  if (probe?.checking) return "检测中…";
  if (probe?.reachable) {
    return probe.latencyMs != null ? `可用 · ${probe.latencyMs}ms` : "可用";
  }
  if (probe?.reachable === false) return "不可用";
  return "检测中…";
}

type BuiltinGroupRowProps = {
  group: BuiltinGroupDisplayRow;
  probe: BuiltinProviderProbe | undefined;
};

function BuiltinGroupRow({ group, probe }: BuiltinGroupRowProps) {
  const configured = true;
  const endpointHint =
    group.endpointCount > 1 ? ` · ${group.endpointCount} 个 endpoint` : "";

  return (
    <li className="llm-config-list-item">
      <div
        className="llm-config-list-row llm-config-list-row--static llm-config-list-row--builtin"
        aria-label={group.label}
      >
        <span
          className={`ping-dot${builtinProbeDotClass(configured, probe)}`}
          title={probe?.message}
        />
        <div className="llm-config-list-main llm-config-list-main--inline">
          <span className="llm-config-list-title">{group.label}</span>
          <span className="llm-config-list-inline-sep" aria-hidden>
            ·
          </span>
          <span className="llm-config-list-meta">
            {group.model}
            {endpointHint}
          </span>
          {group.sponsor && (
            <>
              <span className="llm-config-list-inline-sep" aria-hidden>
                ·
              </span>
              <BuiltinModelSponsorLine sponsor={group.sponsor} compact />
            </>
          )}
        </div>
        <div className="llm-config-list-trail">
          <span
            className={`llm-config-list-badge${builtinProbeBadgeClass(
              configured,
              probe,
            )}`}
            title={probe?.message}
          >
            {splitRowProbeLabel(probe)}
          </span>
        </div>
      </div>
    </li>
  );
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
  const [savingProfileId, setSavingProfileId] = useState<string | null>(null);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedProfileId, setSavedProfileId] = useState<string | null>(null);
  const [status, setStatus] = useState<LlmSettingsResponse | null>(null);
  const [builtinGroupProbe, setBuiltinGroupProbe] = useState<
    Partial<Record<string, BuiltinProviderProbe>>
  >({});
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(EMPTY_PROFILE_DRAFT);
  const [profileEdits, setProfileEdits] = useState<Record<string, ProfileDraft>>({});
  const [expandedProfileId, setExpandedProfileId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [refreshingRemoteConfig, setRefreshingRemoteConfig] = useState(false);
  const profilesRef = useRef<HTMLElement | null>(null);
  const profileItemRefs = useRef<Record<string, HTMLElement | null>>({});

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
      setProfileEdits({});
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const probeBuiltinModels = useCallback(async () => {
    const groupMode = Boolean(status?.builtinGroups?.length);
    const groupIds = groupMode
      ? status!.builtinGroups!.map((group) => group.id)
      : [];

    if (groupMode) {
      setBuiltinGroupProbe(
        Object.fromEntries(
          groupIds.map((id) => [id, { checking: true } satisfies BuiltinProviderProbe]),
        ),
      );
    } else {
      setBuiltinGroupProbe(
        Object.fromEntries(
          USER_MODEL_SELECTOR_IDS.map((providerId) => [
            providerId,
            { checking: true } satisfies BuiltinProviderProbe,
          ]),
        ),
      );
    }

    try {
      const res = await fetch("/api/settings/llm-keys/probe", { cache: "no-store" });
      const body = (await res.json()) as LlmBuiltinProbeResponse;
      if (!res.ok || !body.ok) {
        throw new Error(res.statusText);
      }

      if (body.mode === "groups" && body.groups) {
        setBuiltinGroupProbe(
          Object.fromEntries(
            groupIds.map((id) => {
              const result = body.groups?.[id];
              return [
                id,
                {
                  checking: false,
                  configured: result?.configured,
                  reachable: result?.reachable,
                  message: result?.message,
                  latencyMs: result?.latencyMs,
                } satisfies BuiltinProviderProbe,
              ];
            }),
          ),
        );
        return;
      }

      setBuiltinGroupProbe(
        Object.fromEntries(
          USER_MODEL_SELECTOR_IDS.map((providerId) => {
            const result = body.providers?.[providerId];
            return [
              providerId,
              {
                checking: false,
                configured: result?.configured,
                reachable: result?.reachable,
                message: result?.message,
                latencyMs: result?.latencyMs,
              } satisfies BuiltinProviderProbe,
            ];
          }),
        ),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const ids = groupMode ? groupIds : [...USER_MODEL_SELECTOR_IDS];
      setBuiltinGroupProbe(
        Object.fromEntries(
          ids.map((id) => [
            id,
            {
              checking: false,
              reachable: false,
              message,
            } satisfies BuiltinProviderProbe,
          ]),
        ),
      );
    }
  }, [status?.builtinGroups]);

  useEffect(() => {
    if (!active) return;
    void loadSettings();
  }, [active, loadSettings]);

  useEffect(() => {
    if (!active || !status) return;
    void probeBuiltinModels();
  }, [active, status, probeBuiltinModels]);

  useEffect(() => {
    if (!active) return;
    const onUpdated = () => {
      void loadSettings();
      void probeBuiltinModels();
    };
    window.addEventListener(LLM_KEYS_UPDATED_EVENT, onUpdated);
    return () => window.removeEventListener(LLM_KEYS_UPDATED_EVENT, onUpdated);
  }, [active, loadSettings, probeBuiltinModels]);

  useEffect(() => {
    if (!active) return;
    if (focusProviderId) {
      profilesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (expandedProfileId) {
      profileItemRefs.current[expandedProfileId]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [active, focusProviderId, expandedProfileId, status]);

  const profiles = status?.profiles ?? [];

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

  const toggleProfileExpanded = (profileId: string) => {
    setShowCreateForm(false);
    setExpandedProfileId((prev) => (prev === profileId ? null : profileId));
  };

  const handleCreateProfile = async () => {
    setCreatingProfile(true);
    setError(null);
    setSavedProfileId(null);
    const prevIds = new Set(profiles.map((p) => p.id));
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
      setShowCreateForm(false);
      const created = data.profiles.find((p) => !prevIds.has(p.id));
      if (created) {
        setExpandedProfileId(created.id);
        setSavedProfileId(created.id);
      } else {
        setSavedProfileId("new");
      }
      window.dispatchEvent(new CustomEvent(LLM_KEYS_UPDATED_EVENT));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingProfile(false);
    }
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

  const formatRemoteConfigFetchedAt = (iso: string): string => {
    if (!iso.trim()) return "尚未拉取";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString();
  };

  const handleRefreshRemotePublishConfig = async () => {
    setRefreshingRemoteConfig(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/llm-keys/refresh-remote", {
        method: "POST",
        cache: "no-store",
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        remotePublishConfig?: RemotePublishConfigStatus;
      } | null;
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error ?? res.statusText);
      }
      await loadSettings();
      await probeBuiltinModels();
      window.dispatchEvent(new CustomEvent(LLM_KEYS_UPDATED_EVENT));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshingRemoteConfig(false);
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
      if (expandedProfileId === profileId) setExpandedProfileId(null);
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
          内置 OpenAI 与 DeepSeek 开箱可用。下方可管理多个自定义 endpoint 配置，保存后在模型菜单中按标题选择。
        </p>
      </header>

      {loading && <p className="ws-settings-muted">加载中…</p>}

      {!loading && (
        <div className="llm-settings-layout">
          <section className="ws-settings-group">
            <div className="ws-settings-group-head">
              <span className="ws-settings-group-title">内置模型</span>
              <span className="ws-settings-group-desc">
                以下模型为热心网友赞助，开箱可用，无需填写 Key。
                {status?.remotePublishConfig
                  ? ` 启动时会自动从 OSS 拉取最新 endpoint 配置（上次：${formatRemoteConfigFetchedAt(status.remotePublishConfig.fetchedAt)}，${status.remotePublishConfig.endpointCount} 个 endpoint）。`
                  : ""}
              </span>
              {status?.remotePublishConfig && (
                <div className="app-settings-action-row">
                  <button
                    type="button"
                    className="app-settings-action"
                    disabled={
                      disabled
                      || refreshingRemoteConfig
                      || status.remotePublishConfig.refreshing
                    }
                    onClick={() => void handleRefreshRemotePublishConfig()}
                  >
                    {refreshingRemoteConfig || status.remotePublishConfig.refreshing
                      ? "正在拉取…"
                      : "拉取最新内置配置"}
                  </button>
                </div>
              )}
            </div>
            <ul className="llm-config-list" aria-label="内置模型">
              {(status?.builtinGroups?.length
                ? status.builtinGroups
                : USER_MODEL_SELECTOR_IDS.map((providerId) => {
                    const meta = getLlmProviderMeta(providerId);
                    const st = status?.providers[providerId];
                    return {
                      id: providerId,
                      providerId,
                      label: meta.label,
                      model: st?.model ?? meta.defaultModel,
                      sponsor: resolveBuiltinSponsor(
                        status?.sponsors ?? {},
                        providerId,
                      ),
                      endpointCount: 1,
                    } satisfies BuiltinGroupDisplayRow;
                  })
              ).map((group) => (
                <BuiltinGroupRow
                  key={group.id}
                  group={group}
                  probe={builtinGroupProbe[group.id]}
                />
              ))}
            </ul>
          </section>

          <section className="ws-settings-group" ref={profilesRef}>
            <div className="ws-settings-group-head">
              <span className="ws-settings-group-title">
                自定义配置
                {profiles.length > 0 ? ` (${profiles.length})` : ""}
              </span>
              <span className="ws-settings-group-desc">
                每个配置包含标题、Base URL、API Key，以及同一 endpoint 下可用的多个 model id。
              </span>
            </div>

            {profiles.length === 0 ? (
              <p className="llm-config-list-empty">暂无自定义配置。点击下方按钮添加第一个。</p>
            ) : (
              <ul className="llm-config-list" aria-label="自定义模型配置">
                {profiles.map((profile) => {
                  const expanded = expandedProfileId === profile.id;
                  const saving = savingProfileId === profile.id;
                  const edit = profileDraftFor(profile);
                  return (
                    <li
                      key={profile.id}
                      className="llm-config-list-item"
                      ref={(el) => {
                        profileItemRefs.current[profile.id] = el;
                      }}
                    >
                      <button
                        type="button"
                        className={`llm-config-list-row${
                          expanded ? " llm-config-list-row--expanded" : ""
                        }`}
                        aria-expanded={expanded}
                        disabled={disabled || Boolean(savingProfileId)}
                        onClick={() => toggleProfileExpanded(profile.id)}
                      >
                        <div className="llm-config-list-main">
                          <span className="llm-config-list-title">{profile.title}</span>
                          <span className="llm-config-list-meta">
                            {profile.baseURL}
                            {" · "}
                            {formatProfileModelsSummary(profile)}
                            {profile.defaultModel ? ` · 默认 ${profile.defaultModel}` : ""}
                          </span>
                          {profile.description?.trim() && (
                            <span className="llm-config-list-meta">{profile.description}</span>
                          )}
                        </div>
                        <div className="llm-config-list-trail">
                          <span
                            className={`llm-config-list-badge${
                              profile.apiKey.configured
                                ? " llm-config-list-badge--ok"
                                : ""
                            }`}
                          >
                            {apiKeyStatusLabel(profile.apiKey)}
                          </span>
                          <span className="llm-config-list-chevron" aria-hidden>
                            {expanded ? "▾" : "▸"}
                          </span>
                        </div>
                      </button>

                      {expanded && (
                        <div className="llm-profile-editor">
                          <ProfileEditorFields
                            idPrefix={`profile-${profile.id}`}
                            edit={edit}
                            onChange={(next) => setProfileDraftFor(profile.id, next)}
                            disabled={disabled || saving}
                            keyStatus={profile.apiKey}
                          />
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
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {!showCreateForm ? (
              <button
                type="button"
                className="llm-settings-add-btn"
                disabled={disabled || creatingProfile}
                onClick={() => {
                  setExpandedProfileId(null);
                  setShowCreateForm(true);
                }}
              >
                + 添加配置
              </button>
            ) : (
              <div className="llm-profile-editor llm-profile-editor--new">
                <div className="ws-settings-group-head">
                  <span className="ws-settings-group-title">新建配置</span>
                </div>
                <ProfileEditorFields
                  idPrefix="profile-new"
                  edit={profileDraft}
                  onChange={setProfileDraft}
                  disabled={disabled || creatingProfile}
                />
                <div className="ws-settings-actions">
                  <button
                    type="button"
                    className="ws-settings-save"
                    disabled={disabled || creatingProfile}
                    onClick={() => void handleCreateProfile()}
                  >
                    {creatingProfile ? "添加中…" : "添加配置"}
                  </button>
                  <button
                    type="button"
                    className="ws-settings-secondary"
                    disabled={disabled || creatingProfile}
                    onClick={() => {
                      setShowCreateForm(false);
                      setProfileDraft(EMPTY_PROFILE_DRAFT);
                    }}
                  >
                    取消
                  </button>
                </div>
                {savedProfileId === "new" && !error && (
                  <p className="ws-settings-ok">已添加</p>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {error && <p className="ws-settings-error">{error}</p>}

      <p className="ws-settings-footnote">
        配置保存在本机应用数据目录（`llm-secrets.json`）。
        Agent 可通过 `llm_settings` 工具读写这些配置。
      </p>
    </section>
  );
}
