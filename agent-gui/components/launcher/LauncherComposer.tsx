"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PinnedAction } from "@/lib/action-context";
import {
  canSendComposedMessage,
  parseUserMessageSegments,
} from "@/lib/compose-user-message";
import type { AgentUIMessage } from "@/lib/chat-types";
import {
  defaultEnabledToolIds,
  loadStoredEnabledTools,
} from "@/lib/tool-registry";
import { formatLlmSelection } from "@/lib/llm-selection";
import { LLM_PROVIDER_ID } from "@/lib/llm-providers";
import {
  loadStoredLlmSelectionRaw,
  storeLlmSelectionRaw,
} from "@/lib/llm-prefs";
import { LLM_KEYS_UPDATED_EVENT } from "@/lib/llm-settings-events";
import { useVoiceInput } from "@/lib/voice-input/use-voice-input";
import { useComposerVoiceToggleShortcut } from "@/lib/voice-input/use-composer-voice-shortcut";
import { useGlobalVoiceToggle } from "@/lib/voice-input/use-global-voice-toggle";
import { useLauncherTauriHidden } from "@/lib/launcher/use-launcher-tauri-hidden";
import { LAUNCHER_SHOWN_EVENT } from "@/lib/launcher/launcher-tauri-events";
import { isTauriShell } from "@/lib/tauri-shell";
import { useQkrpcPing } from "@/lib/use-qkrpc-ping";
import {
  fetchLlmOptions,
  pickInitialLlmSelectionFromApi,
  ModelSelector,
} from "@/components/chat/ModelSelector";
import {
  ComposerMarkupField,
  type ComposerMarkupFieldHandle,
} from "@/components/chat/ComposerMarkupField";
import { ComposerPrimaryActionButton } from "@/components/chat/ComposerPrimaryActionButton";
import { ActionTagSelector } from "@/components/chat/ActionTagSelector";
import { ToolSelector } from "@/components/chat/ToolSelector";
import { LauncherTranscript } from "@/components/launcher/LauncherTranscript";
import {
  createLauncherSessionId,
  postLauncherOpened,
  postLauncherSubmit,
  subscribeLauncherBridge,
} from "@/lib/launcher/launcher-bridge";
import {
  dismissLauncherWindow,
} from "@/lib/launcher/launcher-window";
import { LauncherDragRegion } from "@/components/launcher/LauncherDragRegion";
import { LAUNCHER_HIT_TARGET_ATTR } from "@/lib/launcher/launcher-hit-target";

type LauncherSessionState = {
  sessionId: string;
  messages: AgentUIMessage[];
  status: string;
  error: string | null;
  pendingApprovalCount: number;
};

type LauncherComposerProps = {
  onSubmit: (text: string) => void;
  agentBusy?: boolean;
  disabled?: boolean;
};

function LauncherComposer({
  onSubmit,
  agentBusy = false,
  disabled = false,
}: LauncherComposerProps) {
  const [draftMessage, setDraftMessage] = useState("");
  const [enabledTools, setEnabledTools] = useState(defaultEnabledToolIds);
  const [llmSelection, setLlmSelection] = useState(
    formatLlmSelection({ kind: "builtin", providerId: LLM_PROVIDER_ID }),
  );
  const composerRef = useRef<ComposerMarkupFieldHandle>(null);
  const { ping, connectTick } = useQkrpcPing();

  useEffect(() => {
    setEnabledTools(loadStoredEnabledTools());
  }, []);

  const syncLlmSelectionFromApi = useCallback(async () => {
    const data = await fetchLlmOptions();
    if (!data) return;
    const initial = pickInitialLlmSelectionFromApi(
      data,
      loadStoredLlmSelectionRaw(),
    );
    setLlmSelection((prev) => {
      if (prev === initial) return prev;
      storeLlmSelectionRaw(initial);
      return initial;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await syncLlmSelectionFromApi();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [syncLlmSelectionFromApi]);

  useEffect(() => {
    const onKeysUpdated = () => {
      void syncLlmSelectionFromApi();
    };
    window.addEventListener(LLM_KEYS_UPDATED_EVENT, onKeysUpdated);
    return () => window.removeEventListener(LLM_KEYS_UPDATED_EVENT, onKeysUpdated);
  }, [syncLlmSelectionFromApi]);

  const voiceInput = useVoiceInput({
    enabled: !disabled,
    onStreamBegin: () => {
      composerRef.current?.beginVoiceStream();
    },
    onStreamUpdate: (text) => {
      composerRef.current?.updateVoiceStream(text);
    },
    onStreamEnd: (finalText) => {
      composerRef.current?.endVoiceStream(finalText);
    },
    onStreamInterrupt: () => {
      composerRef.current?.endVoiceStream();
    },
    onStreamCancel: () => {
      composerRef.current?.cancelVoiceStream();
    },
  });

  useComposerVoiceToggleShortcut({
    enabled: !disabled,
    phase: voiceInput.phase,
    canUse: voiceInput.canUse,
    pluginStatus: voiceInput.pluginStatus,
    onStart: voiceInput.startVoiceInput,
    onStop: voiceInput.stopVoiceInput,
    onUnavailable: () => window.open("/", "_blank"),
  });

  const activateLauncherForGlobalVoice = useCallback(() => {
    postLauncherOpened();
    requestAnimationFrame(() => composerRef.current?.focus());
  }, []);

  useGlobalVoiceToggle({
    enabled: !disabled,
    phase: voiceInput.phase,
    canUse: voiceInput.canUse,
    pluginStatus: voiceInput.pluginStatus,
    onStart: voiceInput.startVoiceInput,
    onStop: voiceInput.stopVoiceInput,
    onUnavailable: () => window.open("/", "_blank"),
    onGlobalActivate: activateLauncherForGlobalVoice,
  });

  useLauncherTauriHidden({
    onHidden: voiceInput.interruptVoiceInput,
  });

  const insertDraftActionTag = useCallback((action: PinnedAction) => {
    composerRef.current?.insertActionTag(action);
    requestAnimationFrame(() => composerRef.current?.focus());
  }, []);

  const draftTagIds = useMemo(() => {
    const ids = new Set<string>();
    for (const segment of parseUserMessageSegments(draftMessage)) {
      if (segment.type === "tag") ids.add(segment.action.id);
    }
    return ids;
  }, [draftMessage]);

  const canSend = canSendComposedMessage(draftMessage) && !disabled;

  const readComposerText = useCallback(() => {
    return (composerRef.current?.getValue() ?? draftMessage).trim();
  }, [draftMessage]);

  const submitComposer = useCallback(() => {
    if (disabled) return;
    voiceInput.interruptVoiceInput();
    const text = readComposerText();
    if (!canSendComposedMessage(text)) return;
    setDraftMessage("");
    onSubmit(text);
    requestAnimationFrame(() => composerRef.current?.focus());
  }, [disabled, voiceInput, readComposerText, onSubmit]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      composerRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!isTauriShell()) return;

    let unlisten: (() => void) | undefined;
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlisten = await listen(LAUNCHER_SHOWN_EVENT, () => {
        requestAnimationFrame(() => composerRef.current?.focus());
      });
    })();

    return () => {
      unlisten?.();
    };
  }, []);

  const busy = agentBusy;
  const voiceHint = voiceInput.errorHint ?? voiceInput.statusHint;

  return (
    <form
      className="composer-form"
      onSubmit={(event) => {
        event.preventDefault();
        submitComposer();
      }}
    >
      <div className="composer-box">
        <div className="composer-surface">
          <ComposerMarkupField
            ref={composerRef}
            value={draftMessage}
            disabled={disabled}
            placeholder={
              disabled
                ? "Agent 执行中…"
                : "快速指令…（@ 引用动作，Enter 发送）"
            }
            onChange={setDraftMessage}
            onSubmit={submitComposer}
            onUserEdit={voiceInput.interruptVoiceInput}
          />
          <div className="composer-toolbar">
            <div className="composer-toolbar-left">
              <ActionTagSelector
                ping={ping}
                refreshKey={connectTick}
                tagCount={draftTagIds.size}
                embeddedTagIds={draftTagIds}
                onSelect={insertDraftActionTag}
              />
              <ToolSelector
                enabledTools={enabledTools}
                onChange={setEnabledTools}
              />
              <ModelSelector
                selection={llmSelection}
                onChange={(next) => {
                  setLlmSelection(next);
                  storeLlmSelectionRaw(next);
                }}
                onNeedSettings={() => {
                  if (typeof window === "undefined") return;
                  window.open("/", "_blank");
                }}
              />
              {voiceHint ? (
                <span className="composer-hint" role="status">
                  <span
                    className={
                      voiceInput.errorHint
                        ? "composer-voice-hint composer-voice-hint--err"
                        : "composer-voice-hint"
                    }
                  >
                    {voiceHint}
                  </span>
                </span>
              ) : null}
              <LauncherDragRegion className="launcher-drag-toolbar-fill" />
            </div>
            <div className="composer-toolbar-actions">
              <ComposerPrimaryActionButton
                canSend={canSend}
                agentBusy={busy}
                phase={voiceInput.phase}
                pluginStatus={voiceInput.pluginStatus}
                canUseVoice={voiceInput.canUse && !disabled}
                onVoiceStart={voiceInput.startVoiceInput}
                onVoiceStop={voiceInput.stopVoiceInput}
                onUnavailableClick={() => window.open("/", "_blank")}
              />
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

/** Standalone launcher page — submits via BroadcastChannel and mirrors main-window chat. */
export function LauncherPanel() {
  const [session, setSession] = useState<LauncherSessionState | null>(null);
  const [defaultCwd, setDefaultCwd] = useState("");
  const { ping } = useQkrpcPing();
  const transcriptRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/settings/default-cwd")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { path?: string } | null) => {
        if (cancelled || !data?.path) return;
        setDefaultCwd(data.path);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return subscribeLauncherBridge((message) => {
      if (message.type === "launcher:opened") {
        setSession(null);
        return;
      }
      if (message.type === "launcher:session-clear") {
        setSession(null);
        return;
      }
      if (message.type !== "agent:session-sync") return;
      setSession((prev) => {
        if (!prev || prev.sessionId !== message.sessionId) return prev;
        return {
          sessionId: message.sessionId,
          messages: message.messages,
          status: message.status,
          error: message.error,
          pendingApprovalCount: message.pendingApprovalCount,
        };
      });
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      dismissLauncherWindow();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleSubmit = useCallback((text: string) => {
    const sessionId = createLauncherSessionId();
    setSession({
      sessionId,
      messages: [],
      status: "submitted",
      error: null,
      pendingApprovalCount: 0,
    });
    postLauncherSubmit(text, sessionId);
  }, []);

  const busy =
    session != null
    && (session.status === "submitted" || session.status === "streaming");

  return (
    <div className="launcher-root">
      <div className="launcher-shell">
        <div className="launcher-transcript-slot">
          <LauncherDragRegion className="launcher-drag-slot-fill" />
          {session ? (
            <section
              ref={transcriptRef}
              className="launcher-transcript"
              {...{ [LAUNCHER_HIT_TARGET_ATTR]: "" }}
              aria-label="指令执行进度"
              aria-live="polite"
            >
              {session.messages.length === 0 && busy ? (
                <p className="launcher-transcript-placeholder">正在处理指令…</p>
              ) : null}
              <LauncherTranscript
                messages={session.messages}
                status={session.status}
                error={session.error}
                pendingApprovalCount={session.pendingApprovalCount}
                workingDirectory={defaultCwd}
                ping={ping}
              />
            </section>
          ) : null}
        </div>
        <footer
          className="composer launcher-composer"
          {...{ [LAUNCHER_HIT_TARGET_ATTR]: "" }}
        >
          <LauncherComposer
            onSubmit={handleSubmit}
            agentBusy={busy}
            disabled={busy}
          />
        </footer>
      </div>
    </div>
  );
}
