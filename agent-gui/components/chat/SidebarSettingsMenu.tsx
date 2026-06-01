"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  LLM_PROVIDER_LIST,
  type LlmProviderId,
} from "@/lib/llm-providers";

export const LLM_KEYS_UPDATED_EVENT = "agent-gui:llm-keys-updated";

type ProviderKeyStatus = {
  configured: boolean;
  masked?: string;
  source?: "local" | "config" | "env";
};

type LlmKeysResponse = {
  storagePath: string;
  providers: Record<LlmProviderId, ProviderKeyStatus>;
};

function IconGear() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function statusLabel(status: ProviderKeyStatus | undefined): string {
  if (!status?.configured) return "未配置";
  if (status.source === "local") return `已保存 ${status.masked ?? ""}`.trim();
  if (status.source === "config") return `llm-config.json ${status.masked ?? ""}`.trim();
  return "使用 .env.local";
}

type SidebarSettingsMenuProps = {
  disabled?: boolean;
};

function emptyProviderKeyDraft(): Record<LlmProviderId, string> {
  return Object.fromEntries(
    LLM_PROVIDER_LIST.map((p) => [p.id, ""]),
  ) as Record<LlmProviderId, string>;
}

export function SidebarSettingsMenu({ disabled = false }: SidebarSettingsMenuProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState<LlmKeysResponse | null>(null);
  const [draft, setDraft] = useState(emptyProviderKeyDraft);
  const [touched, setTouched] = useState<Set<LlmProviderId>>(() => new Set());
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const loadKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/llm-keys", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = (await res.json()) as LlmKeysResponse;
      setStatus(data);
      setDraft(emptyProviderKeyDraft());
      setTouched(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadKeys();
  }, [open, loadKeys]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSave = async () => {
    if (touched.size === 0) {
      setOpen(false);
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    const providers: Partial<Record<LlmProviderId, string>> = {};
    for (const id of touched) {
      providers[id] = draft[id];
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
        providers: LlmKeysResponse["providers"];
      };
      setStatus((prev) =>
        prev ? { ...prev, providers: data.providers } : prev,
      );
      setDraft(emptyProviderKeyDraft());
      setTouched(new Set());
      setSaved(true);
      window.dispatchEvent(new CustomEvent(LLM_KEYS_UPDATED_EVENT));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

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
        <IconGear />
      </button>
      {open && (
        <div
          id={panelId}
          className="ws-settings-panel"
          role="dialog"
          aria-label="设置"
        >
          <div className="ws-settings-head">
            <span className="ws-settings-title">API Key</span>
            <span className="ws-settings-hint">保存到本机，立即生效</span>
          </div>

          {loading && (
            <p className="ws-settings-muted">加载中…</p>
          )}

          {!loading && (
            <div className="ws-settings-fields">
              {LLM_PROVIDER_LIST.map((provider) => {
                const st = status?.providers[provider.id];
                return (
                  <label key={provider.id} className="ws-settings-field">
                    <span className="ws-settings-field-label">
                      {provider.label}
                    </span>
                    <span className="ws-settings-field-status">
                      {statusLabel(st)}
                    </span>
                    <input
                      type="password"
                      className="ws-settings-input"
                      value={draft[provider.id]}
                      placeholder={
                        st?.configured && !draft[provider.id]
                          ? st.masked ?? "已配置"
                          : `${provider.id} API key`
                      }
                      autoComplete="off"
                      disabled={disabled || saving}
                      onChange={(e) => {
                        setSaved(false);
                        setTouched((prev) => new Set(prev).add(provider.id));
                        setDraft((prev) => ({
                          ...prev,
                          [provider.id]: e.target.value,
                        }));
                      }}
                    />
                  </label>
                );
              })}
            </div>
          )}

          {error && <p className="ws-settings-error">{error}</p>}
          {saved && !error && (
            <p className="ws-settings-ok">已保存</p>
          )}

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
            推荐编辑 <code>llm-config.json</code>；此处保存会写入该文件。留空并保存可清除密钥。
          </p>
        </div>
      )}
    </div>
  );
}
