"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BuiltinModelSponsorLine } from "@/components/chat/BuiltinModelSponsorLine";
import { ProfileBaseUrlField } from "@/components/chat/ProfileBaseUrlField";
import { ProfileModelsField } from "@/components/chat/ProfileModelsField";
import {
  getLlmProviderMeta,
  type LlmProviderId,
} from "@/lib/llm-providers";
import type { LlmBuiltinSponsor } from "@/lib/llm-builtin-sponsors";
import { resolveBuiltinSponsor } from "@/lib/llm-builtin-sponsors";
import {
  dispatchLlmKeysUpdated,
  LLM_KEYS_UPDATED_EVENT,
  type LlmKeysUpdatedDetail,
} from "@/lib/llm-settings-events";
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

type BuiltinGroupEndpointDisplay = {
  id: string;
  baseURL: string;
  model: string;
  selected: boolean;
};

type BuiltinGroupAutoModelDisplay = {
  id: string;
  modelId: string;
  label: string;
  contextLimit: number;
  contextLimitLabel: string;
  selected: boolean;
  order: number;
};

type BuiltinGroupDisplayRow = {
  id: string;
  kind: "builtin" | "auto";
  providerId: LlmProviderId;
  label: string;
  model: string;
  description?: string;
  primaryBaseURL?: string;
  sponsor?: LlmBuiltinSponsor;
  endpointCount: number;
  endpoints: BuiltinGroupEndpointDisplay[];
  autoModels?: BuiltinGroupAutoModelDisplay[];
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
  selectedModels: string[];
  defaultModel: string;
};

const EMPTY_PROFILE_DRAFT: ProfileDraft = {
  title: "",
  description: "",
  apiKey: "",
  baseURL: "https://api.openai.com/v1",
  selectedModels: [],
  defaultModel: "",
};

type BuiltinEndpointProbe = {
  checking?: boolean;
  reachable?: boolean;
  message?: string;
  latencyMs?: number;
};

type BuiltinProviderProbe = {
  checking: boolean;
  configured?: boolean;
  reachable?: boolean;
  message?: string;
  latencyMs?: number;
  endpoints?: Record<string, BuiltinEndpointProbe>;
  autoModels?: Record<string, BuiltinEndpointProbe>;
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
      endpoints?: Record<
        string,
        {
          reachable: boolean;
          message?: string;
          latencyMs?: number;
        }
      >;
      autoModels?: Record<
        string,
        {
          reachable: boolean;
          message?: string;
          latencyMs?: number;
        }
      >;
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
  profileId?: string;
  showTitleFields?: boolean;
};

function ProfileEditorFields({
  edit,
  onChange,
  disabled,
  keyStatus,
  idPrefix,
  profileId,
  showTitleFields = false,
}: ProfileEditorFieldsProps) {
  const set = (patch: Partial<ProfileDraft>) => onChange({ ...edit, ...patch });
  const modelOptions = edit.selectedModels;

  const setSelectedModels = (selectedModels: string[]) => {
    let defaultModel = edit.defaultModel;
    if (defaultModel && !selectedModels.includes(defaultModel)) {
      defaultModel = selectedModels[0] ?? "";
    }
    onChange({ ...edit, selectedModels, defaultModel });
  };

  return (
    <>
      {showTitleFields && (
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
        </>
      )}

      <ProfileBaseUrlField
        idPrefix={idPrefix}
        value={edit.baseURL}
        disabled={disabled}
        onChange={(baseURL) => set({ baseURL })}
      />

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

      <ProfileModelsField
        idPrefix={idPrefix}
        baseURL={edit.baseURL}
        apiKey={edit.apiKey}
        profileId={profileId}
        keyConfigured={keyStatus?.configured}
        selectedModels={edit.selectedModels}
        onSelectedModelsChange={setSelectedModels}
        disabled={disabled}
      />

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
    </>
  );
}

function endpointProbeLabel(probe: BuiltinEndpointProbe | undefined): string {
  if (probe?.checking) return "检测中…";
  if (probe?.reachable) {
    return probe.latencyMs != null ? `可用 · ${probe.latencyMs}ms` : "可用";
  }
  if (probe?.reachable === false) return "不可用";
  return "检测中…";
}

function endpointProbeBadgeClass(
  probe: BuiltinEndpointProbe | undefined,
): string {
  if (probe?.checking || probe?.reachable === undefined) {
    return " llm-config-list-badge--loading";
  }
  if (probe.reachable) return " llm-config-list-badge--ok";
  return " llm-config-list-badge--err";
}

function endpointProbeDotClass(probe: BuiltinEndpointProbe | undefined): string {
  if (probe?.checking || probe?.reachable === undefined) return " loading";
  if (probe.reachable) return " ok";
  return " err";
}

function endpointHostLabel(baseURL: string): string {
  try {
    return new URL(baseURL).host;
  } catch {
    return baseURL;
  }
}

function renderEndpointCardGrid(props: {
  groupLabel: string;
  endpoints: BuiltinGroupEndpointDisplay[];
  probe: BuiltinProviderProbe | undefined;
  selectingEndpointId: string | null;
  disabled?: boolean;
  onSelectEndpoint: (
    groupId: string,
    endpointId: string,
    alreadySelected: boolean,
  ) => void;
  groupId: string;
}) {
  const {
    groupLabel,
    endpoints,
    probe,
    selectingEndpointId,
    disabled,
    onSelectEndpoint,
    groupId,
  } = props;

  if (!endpoints.length) return null;

  return (
    <ul
      className="llm-config-endpoint-grid"
      aria-label={`${groupLabel} endpoint`}
    >
      {endpoints.map((endpoint) => {
        const endpointProbe = probe?.checking
          ? { checking: true }
          : probe?.endpoints?.[endpoint.id];
        const selecting = selectingEndpointId === endpoint.id;
        return (
          <li key={endpoint.id} className="llm-config-endpoint-grid-item">
            <button
              type="button"
              className="llm-config-endpoint-card"
              disabled={disabled || selecting}
              aria-pressed={endpoint.selected}
              aria-current={endpoint.selected ? "true" : undefined}
              title={endpoint.baseURL}
              onClick={() => onSelectEndpoint(
                groupId,
                endpoint.id,
                endpoint.selected,
              )}
            >
              <span className="llm-config-endpoint-card-head">
                <span
                  className={`ping-dot${endpointProbeDotClass(endpointProbe)}`}
                  title={endpointProbe?.message}
                />
                <span className="llm-config-endpoint-card-head-trail">
                  {endpoint.selected ? (
                    <span className="llm-config-endpoint-active-tag">当前使用</span>
                  ) : null}
                  <span
                    className={`llm-config-list-badge${endpointProbeBadgeClass(
                      endpointProbe,
                    )}`}
                    title={endpointProbe?.message}
                  >
                    {selecting
                      ? "切换中…"
                      : endpointProbeLabel(endpointProbe)}
                  </span>
                </span>
              </span>
              <span className="llm-config-endpoint-card-host">
                {endpointHostLabel(endpoint.baseURL)}
              </span>
              <code className="llm-config-endpoint-card-url">
                {endpoint.baseURL}
              </code>
              <span className="llm-config-endpoint-card-model">
                {endpoint.model}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function renderAutoModelCardGrid(props: {
  autoModels: BuiltinGroupAutoModelDisplay[];
  probe: BuiltinProviderProbe | undefined;
  selectingAutoModelId: string | null;
  disabled?: boolean;
  onSelectAutoModel: (modelId: string, alreadySelected: boolean) => void;
}) {
  const {
    autoModels,
    probe,
    selectingAutoModelId,
    disabled,
    onSelectAutoModel,
  } = props;

  if (!autoModels.length) return null;

  return (
    <>
      <p className="llm-config-auto-section-label">候选模型</p>
      <ul className="llm-config-endpoint-grid" aria-label="Auto 候选模型">
        {autoModels.map((model) => {
          const modelProbe = probe?.checking
            ? { checking: true }
            : probe?.autoModels?.[model.id];
          const selecting = selectingAutoModelId === model.id;
          return (
            <li key={model.id} className="llm-config-endpoint-grid-item">
              <button
                type="button"
                className="llm-config-endpoint-card llm-config-auto-model-card"
                disabled={disabled || selecting}
                aria-pressed={model.selected}
                aria-current={model.selected ? "true" : undefined}
                title={model.modelId}
                onClick={() => onSelectAutoModel(model.id, model.selected)}
              >
                <span className="llm-config-endpoint-card-head">
                  <span
                    className={`ping-dot${endpointProbeDotClass(modelProbe)}`}
                    title={modelProbe?.message}
                  />
                  <span className="llm-config-endpoint-card-head-trail">
                    {model.selected ? (
                      <span className="llm-config-endpoint-active-tag">当前使用</span>
                    ) : null}
                    <span
                      className={`llm-config-list-badge${endpointProbeBadgeClass(
                        modelProbe,
                      )}`}
                      title={modelProbe?.message}
                    >
                      {selecting
                        ? "切换中…"
                        : endpointProbeLabel(modelProbe)}
                    </span>
                  </span>
                </span>
                <span className="llm-config-endpoint-card-host">
                  {model.label}
                </span>
                <code className="llm-config-endpoint-card-url">
                  {model.modelId}
                </code>
                <span className="llm-config-endpoint-card-model">
                  {model.contextLimitLabel}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

type BuiltinGroupRowProps = {
  group: BuiltinGroupDisplayRow;
  probe: BuiltinProviderProbe | undefined;
  selectingEndpointId: string | null;
  selectingAutoModelId: string | null;
  disabled?: boolean;
  onSelectEndpoint: (
    groupId: string,
    endpointId: string,
    alreadySelected: boolean,
  ) => void;
  onSelectAutoModel: (modelId: string, alreadySelected: boolean) => void;
};

function BuiltinGroupRow({
  group,
  probe,
  selectingEndpointId,
  selectingAutoModelId,
  disabled,
  onSelectEndpoint,
  onSelectAutoModel,
}: BuiltinGroupRowProps) {
  const configured = true;
  const isAuto = group.kind === "auto";
  const selectedAutoModel = group.autoModels?.find((model) => model.selected)
    ?? group.autoModels?.[0];
  const selectedEndpoint = group.endpoints.find((endpoint) => endpoint.selected)
    ?? group.endpoints[0];
  const selectedProbe = probe?.checking
    ? { checking: true }
    : isAuto && selectedAutoModel
      ? probe?.autoModels?.[selectedAutoModel.id]
      : selectedEndpoint
        ? probe?.endpoints?.[selectedEndpoint.id]
        : undefined;

  return (
    <li className="llm-config-list-item llm-config-list-item--builtin-group">
      <div
        className={`llm-config-list-row llm-config-list-row--static llm-config-list-row--builtin${
          isAuto ? " llm-config-list-row--auto" : ""
        }`}
        aria-label={group.label}
      >
        <span
          className={`ping-dot${builtinProbeDotClass(
            configured,
            selectedProbe
              ? {
                  checking: selectedProbe.checking,
                  reachable: selectedProbe.reachable,
                }
              : probe,
          )}`}
          title={selectedProbe?.message ?? probe?.message}
        />
        <div
          className={`llm-config-list-main${
            isAuto ? "" : " llm-config-list-main--inline"
          }`}
        >
          <span className="llm-config-list-title">{group.label}</span>
          {isAuto ? (
            <>
              {group.description ? (
                <span className="llm-config-list-meta">{group.description}</span>
              ) : null}
              {group.primaryBaseURL ? (
                <code className="llm-config-auto-baseurl">{group.primaryBaseURL}</code>
              ) : null}
            </>
          ) : (
            <>
              <span className="llm-config-list-inline-sep" aria-hidden>
                ·
              </span>
              <span className="llm-config-list-meta">{group.model}</span>
              {group.sponsor && (
                <>
                  <span className="llm-config-list-inline-sep" aria-hidden>
                    ·
                  </span>
                  <BuiltinModelSponsorLine sponsor={group.sponsor} compact />
                </>
              )}
            </>
          )}
        </div>
        <div className="llm-config-list-trail">
          <span
            className={`llm-config-list-badge${endpointProbeBadgeClass(
              selectedProbe,
            )}`}
            title={selectedProbe?.message ?? probe?.message}
          >
            {endpointProbeLabel(selectedProbe)}
          </span>
        </div>
      </div>

      {isAuto ? renderAutoModelCardGrid({
        autoModels: group.autoModels ?? [],
        probe,
        selectingAutoModelId,
        disabled,
        onSelectAutoModel,
      }) : null}

      {!isAuto && group.endpoints.length > 0 ? (
        renderEndpointCardGrid({
          groupLabel: group.label,
          endpoints: group.endpoints,
          probe,
          selectingEndpointId,
          disabled,
          onSelectEndpoint,
          groupId: group.id,
        })
      ) : null}
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
  const [selectingBuiltinEndpointId, setSelectingBuiltinEndpointId] = useState<
    string | null
  >(null);
  const [selectingAutoModelId, setSelectingAutoModelId] = useState<string | null>(
    null,
  );
  const profilesRef = useRef<HTMLElement | null>(null);
  const profileItemRefs = useRef<Record<string, HTMLElement | null>>({});
  const skipNextBuiltinProbeRef = useRef(false);

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
                  endpoints: result?.endpoints,
                  autoModels: result?.autoModels,
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
    if (skipNextBuiltinProbeRef.current) {
      skipNextBuiltinProbeRef.current = false;
      return;
    }
    void probeBuiltinModels();
  }, [active, status, probeBuiltinModels]);

  useEffect(() => {
    if (!active) return;
    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<LlmKeysUpdatedDetail>).detail;
      if (detail?.stickyEndpointOnly) return;
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
      selectedModels: [...profile.models],
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
      const models = profileDraft.selectedModels;
      const res = await fetch("/api/settings/llm-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          createProfile: {
            ...(profileDraft.title.trim()
              ? { title: profileDraft.title.trim() }
              : {}),
            ...(profileDraft.description.trim()
              ? { description: profileDraft.description.trim() }
              : {}),
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
      const models = edit.selectedModels;
      const res = await fetch("/api/settings/llm-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updateProfile: {
            id: profile.id,
            ...(edit.title.trim() ? { title: edit.title.trim() } : {}),
            ...(edit.description.trim() ? { description: edit.description.trim() } : {}),
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

  const handleSelectAutoModel = async (
    modelId: string,
    alreadySelected: boolean,
  ) => {
    if (alreadySelected) return;
    setSelectingAutoModelId(modelId);
    setError(null);
    try {
      const res = await fetch("/api/settings/llm-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectAutoModel: { modelId },
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? res.statusText);
      }
      const data = (await res.json()) as LlmSettingsResponse;
      skipNextBuiltinProbeRef.current = true;
      setStatus(data);
      dispatchLlmKeysUpdated({ stickyEndpointOnly: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSelectingAutoModelId(null);
    }
  };

  const handleSelectBuiltinEndpoint = async (
    groupId: string,
    endpointId: string,
    alreadySelected: boolean,
  ) => {
    if (alreadySelected) return;
    setSelectingBuiltinEndpointId(endpointId);
    setError(null);
    try {
      const res = await fetch("/api/settings/llm-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectBuiltinEndpoint: { groupId, endpointId },
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? res.statusText);
      }
      const data = (await res.json()) as LlmSettingsResponse;
      skipNextBuiltinProbeRef.current = true;
      setStatus(data);
      dispatchLlmKeysUpdated({ stickyEndpointOnly: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSelectingBuiltinEndpointId(null);
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
          内置 OpenAI 与 DeepSeek 开箱可用。下方可添加自定义 endpoint，保存后在模型菜单中选择。
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
                    const baseURL = st?.baseURL ?? meta.defaultBaseURL;
                    const model = st?.model ?? meta.defaultModel;
                    return {
                      id: providerId,
                      kind: "builtin",
                      providerId,
                      label: meta.label,
                      model,
                      sponsor: resolveBuiltinSponsor(
                        status?.sponsors ?? {},
                        providerId,
                      ),
                      endpointCount: 1,
                      endpoints: [{
                        id: `${baseURL}\0${providerId}`,
                        baseURL,
                        model,
                        selected: true,
                      }],
                    } satisfies BuiltinGroupDisplayRow;
                  })
              ).map((group) => (
                <BuiltinGroupRow
                  key={group.id}
                  group={group}
                  probe={builtinGroupProbe[group.id]}
                  selectingEndpointId={selectingBuiltinEndpointId}
                  selectingAutoModelId={selectingAutoModelId}
                  disabled={disabled}
                  onSelectEndpoint={(groupId, endpointId, alreadySelected) => {
                    void handleSelectBuiltinEndpoint(
                      groupId,
                      endpointId,
                      alreadySelected,
                    );
                  }}
                  onSelectAutoModel={(modelId, alreadySelected) => {
                    void handleSelectAutoModel(modelId, alreadySelected);
                  }}
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
                填写 Base URL 与 API Key，加载模型列表并勾选启用；未填标题时将自动命名。
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
                            profileId={profile.id}
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
