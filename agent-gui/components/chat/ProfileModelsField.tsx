"use client";

import { useMemo, useState } from "react";

type ProfileModelsFieldProps = {
  idPrefix: string;
  baseURL: string;
  apiKey: string;
  profileId?: string;
  keyConfigured?: boolean;
  selectedModels: string[];
  onSelectedModelsChange: (models: string[]) => void;
  disabled?: boolean;
};

export function ProfileModelsField({
  idPrefix,
  baseURL,
  apiKey,
  profileId,
  keyConfigured = false,
  selectedModels,
  onSelectedModelsChange,
  disabled = false,
}: ProfileModelsFieldProps) {
  const [discoveredModels, setDiscoveredModels] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState("");

  const canLoad = Boolean(baseURL.trim()) && Boolean(apiKey.trim() || keyConfigured);

  const displayModels = useMemo(() => {
    const merged = new Set<string>();
    for (const modelId of discoveredModels ?? []) merged.add(modelId);
    for (const modelId of selectedModels) merged.add(modelId);
    return Array.from(merged).sort((a, b) => a.localeCompare(b));
  }, [discoveredModels, selectedModels]);

  const filteredModels = useMemo(() => {
    const query = filterQuery.trim().toLowerCase();
    if (!query) return displayModels;
    return displayModels.filter((modelId) => modelId.toLowerCase().includes(query));
  }, [displayModels, filterQuery]);

  const toggleModel = (modelId: string, checked: boolean) => {
    if (checked) {
      if (selectedModels.includes(modelId)) return;
      onSelectedModelsChange([...selectedModels, modelId]);
      return;
    }
    onSelectedModelsChange(selectedModels.filter((item) => item !== modelId));
  };

  const handleLoadModels = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/settings/llm-keys/list-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseURL,
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
          ...(profileId ? { profileId } : {}),
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        models?: string[];
        error?: string;
      } | null;
      if (!res.ok || !body?.ok || !body.models?.length) {
        throw new Error(body?.error ?? res.statusText);
      }
      setDiscoveredModels(body.models);
      const discoveredSet = new Set(body.models);
      onSelectedModelsChange(
        selectedModels.filter((modelId) => discoveredSet.has(modelId)),
      );
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  const selectedCount = selectedModels.length;

  return (
    <div className="ws-settings-field llm-profile-models-field">
      <div className="llm-profile-models-head">
        <span className="ws-settings-field-label" id={`${idPrefix}-models-label`}>
          Models
        </span>
        <button
          type="button"
          className="ws-settings-secondary llm-profile-models-load"
          disabled={disabled || loading || !canLoad}
          onClick={() => void handleLoadModels()}
        >
          {loading ? "加载中…" : "加载可用模型"}
        </button>
      </div>

      {!canLoad && (
        <p className="llm-profile-models-hint">
          填写 Base URL 与 API Key 后，可从此 endpoint 拉取模型列表。
        </p>
      )}

      {loadError && <p className="ws-settings-error llm-profile-models-error">{loadError}</p>}

      {displayModels.length > 0 && (
        <>
          {displayModels.length > 8 && (
            <input
              id={`${idPrefix}-models-filter`}
              type="search"
              className="ws-settings-input llm-profile-models-filter"
              value={filterQuery}
              placeholder="筛选 model…"
              disabled={disabled || loading}
              aria-labelledby={`${idPrefix}-models-label`}
              onChange={(event) => setFilterQuery(event.target.value)}
            />
          )}

          <div
            className="llm-profile-models-list"
            role="group"
            aria-labelledby={`${idPrefix}-models-label`}
          >
            {filteredModels.length === 0 ? (
              <p className="llm-profile-models-hint">无匹配 model</p>
            ) : (
              filteredModels.map((modelId) => {
                const checked = selectedModels.includes(modelId);
                return (
                  <label key={modelId} className="llm-profile-models-item">
                    <input
                      type="checkbox"
                      className="llm-profile-models-checkbox"
                      checked={checked}
                      disabled={disabled || loading}
                      onChange={(event) => toggleModel(modelId, event.target.checked)}
                    />
                    <span className="llm-profile-models-item-label">{modelId}</span>
                  </label>
                );
              })
            )}
          </div>

          <p className="llm-profile-models-summary">
            已选 {selectedCount} / {displayModels.length} 个 model
          </p>
        </>
      )}

      {displayModels.length === 0 && canLoad && !loading && !loadError && (
        <p className="llm-profile-models-hint">
          点击「加载可用模型」后勾选要启用的 model。
        </p>
      )}
    </div>
  );
}
