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
  clampBoxToViewport,
  computeFlyoutDetailLayout,
  computeMeasuredFloatingMenuLayout,
  type FloatingMenuLayout,
  type FlyoutDetailLayout,
} from "@/lib/floating-menu-layout";
import { useMountedAriaControlsId } from "@/lib/use-mounted-aria-controls-id";
import {
  CUSTOM_PROVIDER_ID,
  type LlmProviderId,
} from "@/lib/llm-providers";
import type {
  LlmModelOption,
  LlmOptionsResponse,
  LlmPickerAutoModelOption,
  LlmPickerEndpointOption,
} from "@/lib/llm-options-shared";
import {
  pickInitialLauncherLlmSelection,
  pickInitialLlmSelection,
} from "@/lib/llm-options-shared";
import {
  formatContextWindow,
  getModelPickerDisplay,
  getProfilePickerDisplay,
  humanizeModelId,
  matchesModelPickerQuery,
} from "@/lib/model-picker-display";
import {
  dispatchLlmKeysUpdated,
  LLM_KEYS_UPDATED_EVENT,
} from "@/lib/llm-settings-events";
import {
  findLlmModelOption,
  optionMatchesSelection,
  resolveActiveModelIdForOption,
} from "@/lib/llm-options-shared";
import {
  formatLlmSelection,
  profileSelection,
} from "@/lib/llm-selection";
import {
  loadStoredLlmSelectionRaw,
  storeLlmSelectionRaw,
} from "@/lib/llm-prefs";
import { useDevExperienceEnabled } from "@/lib/release-preview.client";

export type { LlmModelOption, LlmOptionsResponse };

type ModelSelectorProps = {
  selection: string;
  onChange: (selection: string) => void;
  onNeedSettings?: (targetProviderId?: LlmProviderId) => void;
  disabled?: boolean;
  /** When false, only onChange runs (launcher-local model prefs). */
  persistGlobalSelection?: boolean;
};

/** Matches .model-picker-panel { width: min(15.5rem, …) } */
const MODEL_PICKER_MENU_WIDTH_PX = 248;
/** Matches min(22rem, 52vh) upper bound used in CSS */
const MODEL_PICKER_MENU_MAX_HEIGHT_PX = 352;
/** Matches .model-picker-detail--wide width */
const MODEL_PICKER_DETAIL_WIDTH_WIDE_PX = 264;
/** Matches default .model-picker-detail width */
const MODEL_PICKER_DETAIL_WIDTH_NARROW_PX = 216;
/** Grace period when moving from list row to the flyout detail panel. */
const HOVER_DETAIL_HIDE_MS = 220;

type NodeProbeEntry = {
  reachable: boolean;
  message?: string;
  latencyMs?: number;
};

type GroupNodeProbe = {
  checking: boolean;
  endpoints?: Record<string, NodeProbeEntry>;
  autoModels?: Record<string, NodeProbeEntry>;
};

type LlmBuiltinProbeResponse = {
  ok: boolean;
  groups?: Record<
    string,
    {
      endpoints?: Record<string, NodeProbeEntry>;
      autoModels?: Record<string, NodeProbeEntry>;
    }
  >;
};

function nodeProbeStatusLabel(
  entry: NodeProbeEntry | undefined,
  probing: boolean,
): string {
  if (probing) return "检测中…";
  if (!entry) return "—";
  if (!entry.reachable) return "不可用";
  return entry.latencyMs != null ? `可用 · ${entry.latencyMs}ms` : "可用";
}

function nodeProbeStatusClass(
  entry: NodeProbeEntry | undefined,
  probing: boolean,
): string {
  if (probing || !entry) return "";
  return entry.reachable
    ? " model-picker-detail-endpoint-status--ok"
    : " model-picker-detail-endpoint-status--bad";
}

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

function endpointHostLabel(baseURL: string): string {
  try {
    return new URL(baseURL).host;
  } catch {
    return baseURL;
  }
}

function optionDisplay(option: LlmModelOption, activeSelection?: string) {
  if (option.kind === "auto") {
    return {
      displayName: option.label,
      tier: "Fast" as const,
    };
  }
  if (option.kind === "profile") {
    const modelId = activeSelection
      ? resolveActiveModelIdForOption(option, activeSelection)
      : option.modelId;
    return getProfilePickerDisplay(option.title ?? option.label, modelId);
  }
  return getModelPickerDisplay(
    optionProviderId(option),
    option.modelId,
    undefined,
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

export const ModelSelector = memo(function ModelSelector({
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
  const [switchingEndpointId, setSwitchingEndpointId] = useState<string | null>(null);
  const [switchingAutoModelId, setSwitchingAutoModelId] = useState<string | null>(null);
  const [groupNodeProbe, setGroupNodeProbe] = useState<
    Record<string, GroupNodeProbe>
  >({});
  const [panelLayout, setPanelLayout] = useState<FloatingMenuLayout | null>(null);
  const [detailLayout, setDetailLayout] = useState<FlyoutDetailLayout | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const pickerPanelInnerRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const hoverClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const groupProbeSeqRef = useRef(0);
  const probedGroupsRef = useRef<Set<string>>(new Set());
  const panelId = useMountedAriaControlsId();
  const devExperienceEnabled = useDevExperienceEnabled();

  const cancelHideDetail = useCallback(() => {
    if (hoverClearTimerRef.current !== null) {
      clearTimeout(hoverClearTimerRef.current);
      hoverClearTimerRef.current = null;
    }
  }, []);

  const showDetailFor = useCallback((nextSelection: string) => {
    cancelHideDetail();
    setHoveredSelection(nextSelection);
  }, [cancelHideDetail]);

  const scheduleHideDetail = useCallback(() => {
    cancelHideDetail();
    hoverClearTimerRef.current = setTimeout(() => {
      hoverClearTimerRef.current = null;
      setHoveredSelection(null);
    }, HOVER_DETAIL_HIDE_MS);
  }, [cancelHideDetail]);

  const hideDetailNow = useCallback(() => {
    cancelHideDetail();
    setHoveredSelection(null);
  }, [cancelHideDetail]);

  useEffect(() => () => cancelHideDetail(), [cancelHideDetail]);

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
    const measuredHeight = pickerPanelInnerRef.current?.offsetHeight
      ?? MODEL_PICKER_MENU_MAX_HEIGHT_PX;
    setPanelLayout(
      computeMeasuredFloatingMenuLayout(
        button.getBoundingClientRect(),
        MODEL_PICKER_MENU_WIDTH_PX,
        measuredHeight,
        MODEL_PICKER_MENU_MAX_HEIGHT_PX,
        "end",
      ),
    );
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      if (detailRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const active = findLlmModelOption(options, selection);

  useEffect(() => {
    if (!open) {
      setQuery("");
      hideDetailNow();
      return;
    }
    if (active?.selection) {
      showDetailFor(active.selection);
    }
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open, hideDetailNow, active?.selection, showDetailFor]);
  const anyConfigured = options.some((o) => o.configured);
  const activeDisplay = active ? optionDisplay(active, selection) : null;

  const filteredOptions = useMemo(() => {
    return options.filter((o) => {
      const display = optionDisplay(o, selection);
      const modelIds = o.kind === "profile" ? o.profileModels ?? [o.modelId] : [o.modelId];
      return matchesModelPickerQuery(query, {
        displayName: display.displayName,
        tier: display.tier,
        modelId: modelIds.join(" "),
        label: o.label,
        description: o.description,
      });
    });
  }, [options, query, selection]);

  useLayoutEffect(() => {
    if (!open) {
      setPanelLayout(null);
      return;
    }
    updatePanelLayout();
    const panel = pickerPanelInnerRef.current;
    const resizeObserver = panel
      ? new ResizeObserver(() => updatePanelLayout())
      : null;
    if (panel) resizeObserver?.observe(panel);
    window.addEventListener("resize", updatePanelLayout);
    window.addEventListener("scroll", updatePanelLayout, true);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePanelLayout);
      window.removeEventListener("scroll", updatePanelLayout, true);
    };
  }, [open, updatePanelLayout, filteredOptions.length, query]);

  const detailOption = hoveredSelection
    ? options.find((o) => o.selection === hoveredSelection)
    : undefined;

  const updateDetailLayout = useCallback(() => {
    if (!open || !detailOption) {
      setDetailLayout(null);
      return;
    }
    const anchor = pickerPanelInnerRef.current;
    if (!anchor) {
      setDetailLayout(null);
      return;
    }
    const showNodePanel = Boolean(
      detailOption.endpoints?.length || detailOption.autoModels?.length,
    );
    const detailWidth = showNodePanel
      ? MODEL_PICKER_DETAIL_WIDTH_WIDE_PX
      : MODEL_PICKER_DETAIL_WIDTH_NARROW_PX;
    const detailEl = detailRef.current;
    const measuredWidth = detailEl?.offsetWidth ?? detailWidth;
    const measuredHeight = detailEl?.offsetHeight
      ?? MODEL_PICKER_MENU_MAX_HEIGHT_PX;
    const initial = computeFlyoutDetailLayout(
      anchor.getBoundingClientRect(),
      detailWidth,
      measuredHeight,
      MODEL_PICKER_MENU_MAX_HEIGHT_PX,
    );
    const clamped = clampBoxToViewport({
      left: initial.left,
      top: initial.top,
      width: measuredWidth,
      height: Math.min(measuredHeight, initial.maxHeight),
    });
    setDetailLayout({
      ...initial,
      top: clamped.top,
      left: clamped.left,
    });
  }, [open, detailOption]);

  useLayoutEffect(() => {
    if (!open) {
      setDetailLayout(null);
      return;
    }
    updateDetailLayout();
    if (!detailOption) return;

    const detail = detailRef.current;
    const resizeObserver = detail
      ? new ResizeObserver(() => updateDetailLayout())
      : null;
    if (detail) resizeObserver?.observe(detail);

    window.addEventListener("resize", updateDetailLayout);
    window.addEventListener("scroll", updateDetailLayout, true);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateDetailLayout);
      window.removeEventListener("scroll", updateDetailLayout, true);
    };
  }, [
    open,
    detailOption,
    panelLayout,
    groupNodeProbe,
    switchingEndpointId,
    switchingAutoModelId,
    updateDetailLayout,
  ]);

  const probeDetailGroup = useCallback(async (groupId: string) => {
    setGroupNodeProbe((prev) => ({
      ...prev,
      [groupId]: { checking: true },
    }));
    const seq = ++groupProbeSeqRef.current;
    try {
      const res = await fetch("/api/settings/llm-keys/probe", {
        cache: "no-store",
      });
      const body = (await res.json()) as LlmBuiltinProbeResponse;
      if (!res.ok || !body.ok || seq !== groupProbeSeqRef.current) return;
      const groupResult = body.groups?.[groupId];
      if (!groupResult) {
        setGroupNodeProbe((prev) => ({
          ...prev,
          [groupId]: { checking: false },
        }));
        return;
      }
      setGroupNodeProbe((prev) => ({
        ...prev,
        [groupId]: {
          checking: false,
          endpoints: groupResult.endpoints,
          autoModels: groupResult.autoModels,
        },
      }));
    } catch {
      if (seq !== groupProbeSeqRef.current) return;
      setGroupNodeProbe((prev) => ({
        ...prev,
        [groupId]: { checking: false },
      }));
    }
  }, []);

  const invalidateGroupProbe = useCallback((groupId: string) => {
    probedGroupsRef.current.delete(groupId);
    setGroupNodeProbe((prev) => {
      if (!prev[groupId]) return prev;
      const next = { ...prev };
      delete next[groupId];
      return next;
    });
    probedGroupsRef.current.add(groupId);
    void probeDetailGroup(groupId);
  }, [probeDetailGroup]);

  useEffect(() => {
    if (!open) {
      probedGroupsRef.current = new Set();
      groupProbeSeqRef.current += 1;
      setGroupNodeProbe({});
      return;
    }
    const groupId = detailOption?.builtinGroupId;
    if (!groupId) return;
    const hasNodes = Boolean(
      detailOption.endpoints?.length || detailOption.autoModels?.length,
    );
    if (!hasNodes || probedGroupsRef.current.has(groupId)) return;
    probedGroupsRef.current.add(groupId);
    void probeDetailGroup(groupId);
  }, [
    open,
    detailOption?.builtinGroupId,
    detailOption?.endpoints?.length,
    detailOption?.autoModels?.length,
    probeDetailGroup,
  ]);

  const openSettings = (targetProviderId?: LlmProviderId) => {
    setOpen(false);
    onNeedSettings?.(targetProviderId);
  };

  const select = (nextSelection: string, keepOpen = false) => {
    const opt = findLlmModelOption(options, nextSelection);
    if (!opt?.configured) {
      openSettings(opt ? optionProviderId(opt) : undefined);
      return;
    }
    onChange(nextSelection);
    if (persistGlobalSelection) {
      storeLlmSelectionRaw(nextSelection);
      void persistActiveSelection(nextSelection);
    }
    if (!keepOpen) {
      setOpen(false);
    }
  };

  const selectProfileModel = (
    profileId: string,
    modelId: string,
    keepOpen = false,
  ) => {
    select(
      formatLlmSelection(profileSelection(profileId, modelId)),
      keepOpen,
    );
  };

  const togglePanel = () => {
    if (ready && !anyConfigured) {
      openSettings();
      return;
    }
    setOpen((v) => !v);
  };

  const patchBuiltinEndpointSelection = useCallback(
    (groupId: string, endpointId: string) => {
      setOptions((prev) =>
        prev.map((opt) => {
          if (opt.builtinGroupId !== groupId || !opt.endpoints?.length) {
            return opt;
          }
          const target = opt.endpoints.find((entry) => entry.id === endpointId);
          return {
            ...opt,
            endpoints: opt.endpoints.map((entry) => ({
              ...entry,
              selected: entry.id === endpointId,
            })),
            baseURL: target?.baseURL ?? opt.baseURL,
          };
        }),
      );
    },
    [],
  );

  const switchBuiltinEndpoint = async (
    groupId: string,
    endpointId: string,
    alreadySelected: boolean,
  ) => {
    if (alreadySelected) return;
    patchBuiltinEndpointSelection(groupId, endpointId);
    setSwitchingEndpointId(endpointId);
    try {
      const res = await fetch("/api/settings/llm-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectBuiltinEndpoint: { groupId, endpointId },
        }),
      });
      if (!res.ok) {
        await refreshOptions();
        return;
      }
      invalidateGroupProbe(groupId);
      await refreshOptions();
      dispatchLlmKeysUpdated({ stickyEndpointOnly: true });
    } finally {
      setSwitchingEndpointId(null);
    }
  };

  const patchAutoModelSelection = useCallback((modelId: string) => {
    setOptions((prev) =>
      prev.map((opt) => {
        if (opt.kind !== "auto" || !opt.autoModels?.length) return opt;
        const target = opt.autoModels.find((entry) => entry.id === modelId);
        return {
          ...opt,
          autoModels: opt.autoModels.map((entry) => ({
            ...entry,
            selected: entry.id === modelId,
          })),
          modelId: target?.modelId ?? opt.modelId,
        };
      }),
    );
  }, []);

  const switchAutoModel = async (
    modelId: string,
    alreadySelected: boolean,
  ) => {
    if (alreadySelected) return;
    patchAutoModelSelection(modelId);
    setSwitchingAutoModelId(modelId);
    try {
      const res = await fetch("/api/settings/llm-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectAutoModel: { modelId },
        }),
      });
      if (!res.ok) {
        await refreshOptions();
        return;
      }
      const groupId = options.find((o) => o.kind === "auto")?.builtinGroupId;
      if (groupId) invalidateGroupProbe(groupId);
      await refreshOptions();
      dispatchLlmKeysUpdated({ stickyEndpointOnly: true });
    } finally {
      setSwitchingAutoModelId(null);
    }
  };

  const activeBaseURL = active?.baseURL?.trim();
  const triggerTitle = active?.configured
    ? [
        `${activeDisplay?.displayName ?? active.modelId} · ${activeDisplay?.tier ?? active.modelId}`,
        devExperienceEnabled && activeBaseURL ? activeBaseURL : null,
      ].filter(Boolean).join("\n")
    : ready && !anyConfigured
      ? "尚未配置模型，点击打开设置"
      : active && !active.configured
        ? `${active.modelId} 未配置，点击打开设置`
        : "选择对话模型";

  const pickerPanel = (
    <div
      ref={pickerPanelInnerRef}
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
        if (next instanceof Node && detailRef.current?.contains(next)) {
          return;
        }
        scheduleHideDetail();
      }}
    >
      <div
        className="model-picker-search-wrap"
        onMouseEnter={hideDetailNow}
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
            const display = optionDisplay(p, selection);
            const selected = optionMatchesSelection(p, selection);
            const showEdit = !p.configured && hoveredSelection === p.selection;
            const detailModelId = resolveActiveModelIdForOption(p, selection);
            return (
              <li
                key={p.kind === "profile" ? `profile:${p.profileId}` : p.selection}
                role="option"
                aria-selected={selected}
                className={`model-picker-row${
                  selected ? " model-picker-row--selected" : ""
                }${!p.configured ? " model-picker-row--unconfigured" : ""}`}
                onMouseEnter={() => showDetailFor(p.selection)}
                onMouseLeave={() => scheduleHideDetail()}
              >
                <button
                  type="button"
                  className="model-picker-item"
                  onClick={() => {
                    if (p.kind === "profile" && p.profileId) {
                      selectProfileModel(p.profileId, detailModelId);
                      return;
                    }
                    select(p.selection);
                  }}
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
                    onClick={() => openSettings(optionProviderId(p))}
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
        onMouseEnter={hideDetailNow}
        onClick={() => openSettings()}
      >
        配置模型…
      </button>
    </div>
  );

  const detailFlyout = detailOption && detailLayout ? (() => {
        const groupProbe = detailOption.builtinGroupId
          ? groupNodeProbe[detailOption.builtinGroupId]
          : undefined;
        const probing = !groupProbe || groupProbe.checking;
        const endpoints = detailOption.endpoints ?? [];
        const autoModels = detailOption.autoModels ?? [];
        const showNodePanel = Boolean(endpoints.length || autoModels.length);
        return (
        <aside
          ref={detailRef}
          className={`model-picker-detail model-picker-detail--viewport${
            showNodePanel ? " model-picker-detail--wide" : ""
          }${detailLayout.side === "left" ? " model-picker-detail--left" : ""}`}
          style={{
            top: detailLayout.top,
            left: detailLayout.left,
            maxHeight: detailLayout.maxHeight,
          }}
          aria-label={`${optionDisplay(detailOption, selection).displayName} 详情`}
          onMouseEnter={() => showDetailFor(detailOption.selection)}
          onMouseLeave={() => scheduleHideDetail()}
        >
          {(() => {
            const detailModelId = resolveActiveModelIdForOption(
              detailOption,
              selection,
            );
            const display = optionDisplay(detailOption, selection);
            const profileModels = detailOption.kind === "profile"
              ? detailOption.profileModels ?? []
              : [];
            const showDevBaseURL = devExperienceEnabled
              && detailOption.baseURL
              && !showNodePanel;
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
                {showDevBaseURL ? (
                  <p className="model-picker-detail-meta">
                    <span className="model-picker-detail-model-label">
                      Base URL
                    </span>
                    <code className="model-picker-detail-baseurl">
                      {detailOption.baseURL}
                    </code>
                  </p>
                ) : null}
                {endpoints.length > 0 && detailOption.builtinGroupId ? (
                  <div className="model-picker-detail-endpoints">
                    <span className="model-picker-detail-model-label">
                      可选节点
                    </span>
                    <ul className="model-picker-detail-endpoint-list" role="listbox">
                      {endpoints.map((endpoint) => {
                        const switching = switchingEndpointId === endpoint.id;
                        const probeEntry = groupProbe?.endpoints?.[endpoint.id];
                        return (
                          <li key={endpoint.id}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={endpoint.selected}
                              className={`model-picker-detail-endpoint-item${
                                endpoint.selected
                                  ? " model-picker-detail-endpoint-item--active"
                                  : ""
                              }`}
                              disabled={Boolean(switchingEndpointId)}
                              onClick={() => {
                                void switchBuiltinEndpoint(
                                  detailOption.builtinGroupId!,
                                  endpoint.id,
                                  endpoint.selected,
                                );
                              }}
                            >
                              <span className="model-picker-detail-endpoint-main">
                                <span className="model-picker-detail-endpoint-host">
                                  {endpointHostLabel(endpoint.baseURL)}
                                </span>
                                <code className="model-picker-detail-endpoint-url">
                                  {endpoint.baseURL}
                                </code>
                              </span>
                              <span className="model-picker-detail-endpoint-trail">
                                {endpoint.selected ? (
                                  <span className="model-picker-detail-endpoint-tag">
                                    当前使用
                                  </span>
                                ) : null}
                                {switching ? (
                                  <span className="model-picker-detail-endpoint-status">
                                    切换中…
                                  </span>
                                ) : (
                                  <span
                                    className={`model-picker-detail-endpoint-status${nodeProbeStatusClass(probeEntry, probing)}`}
                                  >
                                    {nodeProbeStatusLabel(probeEntry, probing)}
                                  </span>
                                )}
                                {endpoint.selected && !switching ? (
                                  <CheckIcon />
                                ) : null}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
                {autoModels.length > 0 ? (
                  <div className="model-picker-detail-models">
                    <span className="model-picker-detail-model-label">
                      可选候选
                    </span>
                    <ul className="model-picker-detail-model-list" role="listbox">
                      {autoModels.map((model) => {
                        const switching = switchingAutoModelId === model.id;
                        const probeEntry = groupProbe?.autoModels?.[model.id];
                        return (
                          <li key={model.id}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={model.selected}
                              className={`model-picker-detail-model-item${
                                model.selected
                                  ? " model-picker-detail-model-item--active"
                                  : ""
                              }`}
                              disabled={Boolean(switchingAutoModelId)}
                              onClick={() => {
                                void switchAutoModel(model.id, model.selected);
                              }}
                            >
                              <span className="model-picker-detail-auto-model-main">
                                <span>{model.label}</span>
                                <code>{model.modelId}</code>
                                <span className="model-picker-detail-auto-model-meta">
                                  {model.contextLimitLabel}
                                </span>
                              </span>
                              <span className="model-picker-detail-endpoint-trail">
                                {model.selected ? (
                                  <span className="model-picker-detail-endpoint-tag">
                                    当前使用
                                  </span>
                                ) : null}
                                {switching ? (
                                  <span className="model-picker-detail-endpoint-status">
                                    切换中…
                                  </span>
                                ) : (
                                  <span
                                    className={`model-picker-detail-endpoint-status${nodeProbeStatusClass(probeEntry, probing)}`}
                                  >
                                    {nodeProbeStatusLabel(probeEntry, probing)}
                                  </span>
                                )}
                                {model.selected && !switching ? (
                                  <CheckIcon />
                                ) : null}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}
                {profileModels.length > 1 ? (
                  <div className="model-picker-detail-models">
                    <span className="model-picker-detail-model-label">
                      Models
                    </span>
                    <ul className="model-picker-detail-model-list" role="listbox">
                      {profileModels.map((modelId) => {
                        const activeModel = detailModelId === modelId;
                        return (
                          <li key={modelId}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={activeModel}
                              className={`model-picker-detail-model-item${
                                activeModel
                                  ? " model-picker-detail-model-item--active"
                                  : ""
                              }`}
                              onClick={() => {
                                if (!detailOption.profileId) return;
                                selectProfileModel(
                                  detailOption.profileId,
                                  modelId,
                                  true,
                                );
                              }}
                            >
                              <span>{humanizeModelId(modelId)}</span>
                              {activeModel && <CheckIcon />}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : !(detailOption.autoModels?.length ?? 0) ? (
                  <p className="model-picker-detail-model">
                    <span className="model-picker-detail-model-label">
                      Model
                    </span>
                    <code>{detailModelId}</code>
                  </p>
                ) : null}
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
        );
  })() : null;

  const pickerFloat = open ? (
      <div
        ref={panelRef}
        className="model-picker-float model-picker-float--portal"
        role="presentation"
        style={
          panelLayout
            ? {
                position: "fixed",
                top: panelLayout.top,
                left: panelLayout.left,
                maxHeight: panelLayout.maxHeight,
                zIndex: 260,
              }
            : {
                position: "fixed",
                visibility: "hidden",
                top: 0,
                left: 0,
                zIndex: 260,
              }
        }
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
      {typeof document !== "undefined" && detailFlyout
        ? createPortal(detailFlyout, document.body)
        : null}
    </div>
  );
});

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
