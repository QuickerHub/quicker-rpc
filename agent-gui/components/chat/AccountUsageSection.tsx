"use client";

import { useCallback, useEffect, useState } from "react";
import { formatTokenCount } from "@/lib/chat-types";
import {
  formatIdentityKindLabel,
  formatQuickerAccountDisplayName,
  formatQuickerAccountStatus,
  formatUsageUpdatedAt,
} from "@/lib/llm-usage-display";
import type {
  LlmUsageApiResponse,
  LlmUsageTotals,
  LlmUserUsageRecord,
} from "@/lib/llm-usage-types";

type AccountUsageSectionProps = {
  active: boolean;
  disabled?: boolean;
};

const EMPTY_TOTALS: LlmUsageTotals = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  reasoningTokens: 0,
  requestCount: 0,
};

function resolveTotals(usage: LlmUserUsageRecord | null): LlmUsageTotals {
  return usage?.totals ?? EMPTY_TOTALS;
}

export function AccountUsageSection({
  active,
  disabled = false,
}: AccountUsageSectionProps) {
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LlmUsageApiResponse | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const url = refresh ? "/api/llm/usage?refresh=1" : "/api/llm/usage";
      const res = await fetch(url, { cache: "no-store" });
      const body = (await res.json()) as LlmUsageApiResponse;
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? res.statusText);
      }
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active, load]);

  const identity = data?.identity;
  const account = data?.account;
  const usage = data?.usage ?? null;
  const totals = resolveTotals(usage);
  const hasUsage = totals.requestCount > 0;

  const accountStatus = formatQuickerAccountStatus(account);
  const displayName = formatQuickerAccountDisplayName(account);
  const identityId = identity?.id?.trim() || "—";
  const identityKindLabel = identity
    ? formatIdentityKindLabel(identity.kind)
    : undefined;

  const usageLine = hasUsage
    ? `${formatTokenCount(totals.totalTokens)} Token · ${totals.requestCount} 次请求`
    : "暂无用量";

  const metaLine = hasUsage
    ? `最近更新 ${formatUsageUpdatedAt(usage?.updatedAt)}`
    : "使用内置模型（OpenAI / DeepSeek 等）对话后将累计";

  return (
    <section className="app-settings-section-block app-settings-account-section">
      <header className="app-settings-section-head app-settings-section-head--inline">
        <div className="app-settings-account-head">
          <div>
            <h2 className="app-settings-section-title">账号与用量</h2>
            <p className="app-settings-section-hint">
              内置托管模型 token 统计（OpenAI / DeepSeek）
            </p>
          </div>
          <button
            type="button"
            className="app-settings-action"
            disabled={disabled || loading || refreshing}
            onClick={() => void load(true)}
          >
            {refreshing ? "刷新中…" : "刷新"}
          </button>
        </div>
      </header>

      {loading && !data && (
        <p className="ws-settings-muted">加载中…</p>
      )}

      {data && (
        <div className="app-settings-account-card">
          <div className="app-settings-account-summary">
            <span
              className={`ping-dot${account?.loggedIn ? " ok" : account?.message ? " err" : ""}`}
            />
            <div className="app-settings-account-summary-body">
              {account?.loggedIn ? (
                <div className="app-settings-account-info-grid app-settings-account-info-grid--stacked">
                  {displayName && (
                    <div className="app-settings-account-info-row">
                      <span className="app-settings-account-info-label">Quicker 账号</span>
                      <span className="app-settings-account-info-value">
                        {displayName}
                      </span>
                    </div>
                  )}
                  <div className="app-settings-account-info-row">
                    <span className="app-settings-account-info-label">
                      用户标识符
                      {identityKindLabel && (
                        <span className="app-settings-account-info-label-hint">
                          {identityKindLabel}
                        </span>
                      )}
                    </span>
                    <span className="app-settings-account-info-value app-settings-account-info-value--mono app-settings-account-info-value--full">
                      {identityId}
                    </span>
                  </div>
                  <div className="app-settings-account-info-row">
                    <span className="app-settings-account-info-label">累计用量</span>
                    <span className="app-settings-account-info-value">{usageLine}</span>
                  </div>
                </div>
              ) : (
                <p className="app-settings-account-summary-line">
                  <span className="app-settings-account-summary-status">
                    {accountStatus}
                  </span>
                </p>
              )}
              <p className="app-settings-account-hint">{metaLine}</p>
            </div>
          </div>
        </div>
      )}

      {error && <p className="ws-settings-error">{error}</p>}
    </section>
  );
}
