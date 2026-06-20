"use client";

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PinnedAction } from "@/lib/action-context";
import type { BrowserElementTag } from "@/lib/browser-element-tag";
import type { ProgramStepTag } from "@/lib/program-step-tag";
import {
  parseUserMessageSegments,
} from "@/lib/compose-user-message";
import type { AgentUIMessage } from "@/lib/chat-types";
import type { AppSettingsTabId } from "@/lib/app-settings-tabs";
import type { PingState } from "@/lib/use-qkrpc-ping";
import type { LlmProviderId } from "@/lib/llm-providers";
import { ModelSelector } from "./ModelSelector";
import { ComposerCursorSdkLink } from "./ComposerCursorSdkLink";
import type { ChatMode } from "@/lib/chat-mode";
import { CHAT_MODE_AGENT, CHAT_MODE_ASK } from "@/lib/chat-mode";
import { useVoiceInput } from "@/lib/voice-input/use-voice-input";
import { useComposerVoiceToggleShortcut } from "@/lib/voice-input/use-composer-voice-shortcut";
import { notifyVoiceServiceStarting } from "@/lib/voice-input/voice-input-notify";
import { requestVoicePluginSetup } from "@/lib/voice-input/voice-plugin-install-flow";
import {
  ComposerMarkupField,
  type ComposerMarkupFieldHandle,
} from "./ComposerMarkupField";
import { ComposerPrimaryActionButton } from "./ComposerPrimaryActionButton";
import { ComposerShortcutCards } from "./ComposerShortcutCards";
import { DESIGNER_EMBED_ONBOARDING_TIPS } from "@/lib/composer-onboarding-tips";
import { ComposerOnboardingTips } from "./ComposerOnboardingTips";
import { ComposerTestPromptsPicker } from "./ComposerTestPromptsPicker";
import { ActionTagSelector } from "./ActionTagSelector";
import { ToolSelector } from "./ToolSelector";
import { ChatModeSelector } from "./ChatModeSelector";
import { ComposerMessageQueue } from "./ComposerMessageQueue";
import { ContextUsage } from "./ContextUsage";

const EMPTY_DRAFT_TAG_IDS = new Set<string>();

export type ChatComposerFooterHandle = {
  focus: () => void;
  focusAtEnd: () => void;
  getValue: () => string;
  setValue: (text: string) => void;
  clear: () => void;
  insertActionTag: (action: PinnedAction) => void;
  insertBrowserElementTag: (element: BrowserElementTag) => void;
  insertProgramStepTag: (tag: ProgramStepTag) => void;
  insertMentionTrigger: () => void;
  insertPlainText: (text: string) => void;
  beginVoiceStream: () => void;
  updateVoiceStream: (text: string) => void;
  endVoiceStream: (finalText?: string) => void;
  cancelVoiceStream: () => void;
};

type ChatComposerFooterProps = {
  visible: boolean;
  ephemeral: boolean;
  editAnchorMessageId: string | null;
  isEmptyThread: boolean;
  busy: boolean;
  queueLength: number;
  queuedMessages: readonly string[];
  onRemoveFromQueue: (index: number) => void;
  settingsOpen: boolean;
  messages: AgentUIMessage[];
  ping: PingState;
  connectTick: number;
  devExperienceEnabled: boolean;
  chatMode: ChatMode;
  enabledTools: string[];
  llmSelection: string;
  onChatModeChange: (mode: ChatMode) => void;
  onEnabledToolsChange: (tools: string[]) => void;
  onLlmSelectionChange: (selection: string) => void;
  onToggleSettings: () => void;
  onOpenSettings: (targetProviderId?: LlmProviderId, tab?: AppSettingsTabId) => void;
  onSubmit: () => void;
  onSendTestPrompt: (text: string) => void;
  onStop: () => void;
  onExitEdit: () => void;
  onEditAnchorDraftChange?: (draft: string) => void;
  voiceInterruptRef?: React.MutableRefObject<(() => void) | null>;
  workingDirectory?: string;
  designerEmbed?: boolean;
  /** When set, overrides default empty-thread hiding for the context ring. */
  showContextUsage?: boolean;
};

const ChatComposerFooterInner = forwardRef<
  ChatComposerFooterHandle,
  ChatComposerFooterProps
>(function ChatComposerFooterInner(
  {
    visible,
    ephemeral,
    editAnchorMessageId,
    isEmptyThread,
    busy,
    queueLength,
    queuedMessages,
    onRemoveFromQueue,
    settingsOpen,
    messages,
    ping,
    connectTick,
    devExperienceEnabled,
    chatMode,
    enabledTools,
    llmSelection,
    onChatModeChange,
    onEnabledToolsChange,
    onLlmSelectionChange,
    onToggleSettings,
    onOpenSettings,
    onSubmit,
    onSendTestPrompt,
    onStop,
    onExitEdit,
    onEditAnchorDraftChange,
    voiceInterruptRef,
    workingDirectory = "",
    designerEmbed = false,
    showContextUsage,
  },
  ref,
) {
  const composerRef = useRef<ComposerMarkupFieldHandle>(null);
  const [draftMessage, setDraftMessage] = useState("");

  const handleDraftChange = useCallback(
    (next: string) => {
      setDraftMessage(next);
      if (editAnchorMessageId) {
        onEditAnchorDraftChange?.(next);
      }
    },
    [editAnchorMessageId, onEditAnchorDraftChange],
  );

  const draftState = useMemo(() => {
    const ids = new Set<string>();
    let canSend = false;
    for (const segment of parseUserMessageSegments(draftMessage)) {
      if (segment.type === "tag") {
        ids.add(segment.action.id);
        canSend = true;
      } else if (segment.type === "browser-element") {
        canSend = true;
      } else if (segment.type === "program-step") {
        canSend = true;
      } else if (segment.type === "slash-tag") {
        canSend = true;
      } else if (segment.text.trim()) {
        canSend = true;
      }
    }
    return { canSend, tagIds: ids.size > 0 ? ids : EMPTY_DRAFT_TAG_IDS };
  }, [draftMessage]);

  const handleModelNeedSettings = useCallback(
    (providerId?: LlmProviderId) => onOpenSettings(providerId, "models"),
    [onOpenSettings],
  );

  const voiceInput = useVoiceInput({
    enabled: visible && !ephemeral,
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

  useEffect(() => {
    if (!voiceInterruptRef) return;
    voiceInterruptRef.current = voiceInput.interruptVoiceInput;
  }, [voiceInput.interruptVoiceInput, voiceInterruptRef]);

  const handleVoiceSetup = useCallback(() => {
    void requestVoicePluginSetup();
  }, []);

  useComposerVoiceToggleShortcut({
    enabled: !editAnchorMessageId,
    phase: voiceInput.phase,
    canUse: voiceInput.canUse,
    pluginStatus: voiceInput.pluginStatus,
    onStart: voiceInput.startVoiceInput,
    onStop: voiceInput.stopVoiceInput,
    onUnavailable: handleVoiceSetup,
  });

  const insertDraftActionTag = useCallback((action: PinnedAction) => {
    composerRef.current?.insertActionTag(action);
    requestAnimationFrame(() => composerRef.current?.focus());
  }, []);

  const handleSubmit = useCallback(() => {
    voiceInput.interruptVoiceInput();
    onSubmit();
  }, [onSubmit, voiceInput.interruptVoiceInput]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => composerRef.current?.focus(),
      focusAtEnd: () => composerRef.current?.focusAtEnd(),
      getValue: () => composerRef.current?.getValue() ?? draftMessage,
      setValue: (text: string) => {
        setDraftMessage(text);
        if (editAnchorMessageId) {
          onEditAnchorDraftChange?.(text);
        }
        requestAnimationFrame(() => composerRef.current?.focusAtEnd());
      },
      clear: () => {
        setDraftMessage("");
        if (editAnchorMessageId) {
          onEditAnchorDraftChange?.("");
        }
      },
      insertActionTag: (action: PinnedAction) => {
        composerRef.current?.insertActionTag(action);
      },
      insertBrowserElementTag: (element: BrowserElementTag) => {
        composerRef.current?.insertBrowserElementTag(element);
      },
      insertProgramStepTag: (tag: ProgramStepTag) => {
        composerRef.current?.insertProgramStepTag(tag);
        requestAnimationFrame(() => composerRef.current?.focus());
      },
      insertMentionTrigger: () => {
        composerRef.current?.insertMentionTrigger();
      },
      insertPlainText: (text: string) => {
        composerRef.current?.insertPlainText(text);
      },
      beginVoiceStream: () => {
        composerRef.current?.beginVoiceStream();
      },
      updateVoiceStream: (text: string) => {
        composerRef.current?.updateVoiceStream(text);
      },
      endVoiceStream: (finalText?: string) => {
        composerRef.current?.endVoiceStream(finalText);
      },
      cancelVoiceStream: () => {
        composerRef.current?.cancelVoiceStream();
      },
    }),
    [draftMessage, editAnchorMessageId, onEditAnchorDraftChange],
  );

  const showContextRing =
    showContextUsage ?? (!isEmptyThread || designerEmbed);

  return (
    <footer
      className={`composer${editAnchorMessageId ? " composer--branch-edit" : ""}${designerEmbed ? " composer--designer-embed" : ""}`}
    >
      {editAnchorMessageId ? (
        <div className="composer-edit-banner" role="status">
          <span className="composer-edit-banner-text">
            正在编辑较早的消息；在下方输入框修改，Enter 发送并从此处继续
          </span>
          <button
            type="button"
            className="composer-edit-banner-cancel"
            onClick={onExitEdit}
          >
            完成
          </button>
        </div>
      ) : null}
      {isEmptyThread && !editAnchorMessageId ? (
        <ComposerOnboardingTips
          disabled={busy}
          tips={designerEmbed ? DESIGNER_EMBED_ONBOARDING_TIPS : undefined}
          onOpenSettings={onOpenSettings}
          onTryMention={() => composerRef.current?.insertMentionTrigger()}
          onFocusComposer={() => composerRef.current?.focus()}
        />
      ) : null}
      {!designerEmbed ? (
        <ComposerShortcutCards
          settingsOpen={settingsOpen}
          onToggleSettings={onToggleSettings}
          disabled={busy}
        />
      ) : null}
      {!editAnchorMessageId ? (
        <ComposerMessageQueue
          queuedMessages={queuedMessages}
          busy={busy}
          onRemove={onRemoveFromQueue}
        />
      ) : null}
      <form
        className="composer-form"
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
      >
        <div className="composer-box">
          <div className="composer-surface">
            <ComposerMarkupField
              ref={composerRef}
              value={draftMessage}
              workingDirectory={workingDirectory}
              enableSlashCommands={
                (chatMode === CHAT_MODE_AGENT || chatMode === CHAT_MODE_ASK)
                && Boolean(workingDirectory.trim())
              }
              placeholder={
                editAnchorMessageId
                  ? "修改后 Enter 发送，将从此消息处重新对话…（@ 引用动作）"
                  : designerEmbed
                    ? queueLength > 0 && busy
                      ? "Enter 发送队列…"
                      : queueLength > 0
                        ? "Agent 完成后自动发送队列…"
                        : "描述要如何修改此动作…（@ 引用动作或选中步骤）"
                    : queueLength > 0 && busy
                      ? "Enter 立即发送队列第一条，或输入新消息加入队列…"
                      : queueLength > 0
                        ? "Agent 完成后将自动发送队列中的消息…"
                        : "描述你想在 Quicker 里做的事…（@ 引用动作，/ 斜杠命令）"
              }
              onChange={handleDraftChange}
              onSubmit={handleSubmit}
              onUserEdit={voiceInput.interruptVoiceInput}
            />
            <div className="composer-toolbar">
              <div className="composer-toolbar-left">
                {!designerEmbed ? (
                  <ActionTagSelector
                    ping={ping}
                    refreshKey={connectTick}
                    tagCount={draftState.tagIds.size}
                    embeddedTagIds={draftState.tagIds}
                    onSelect={insertDraftActionTag}
                  />
                ) : null}
                {!ephemeral && !designerEmbed ? (
                  <ChatModeSelector
                    mode={chatMode}
                    onChange={onChatModeChange}
                  />
                ) : null}
                {devExperienceEnabled && !designerEmbed ? (
                  <ToolSelector
                    enabledTools={enabledTools}
                    onChange={onEnabledToolsChange}
                  />
                ) : null}
                {devExperienceEnabled && !designerEmbed ? (
                  <ComposerTestPromptsPicker
                    onSendPrompt={onSendTestPrompt}
                  />
                ) : null}
                <ModelSelector
                  selection={llmSelection}
                  onChange={onLlmSelectionChange}
                  onNeedSettings={handleModelNeedSettings}
                />
                {!designerEmbed ? (
                  <ComposerCursorSdkLink disabled={busy} />
                ) : null}
                {voiceInput.errorHint ? (
                  <span className="composer-hint" role="status">
                    <span className="composer-voice-hint composer-voice-hint--err">
                      {voiceInput.errorHint}
                    </span>
                  </span>
                ) : voiceInput.statusHint ? (
                  <span className="composer-hint" role="status">
                    <span className="composer-voice-hint">
                      {voiceInput.statusHint}
                    </span>
                  </span>
                ) : editAnchorMessageId ? (
                  <span className="composer-hint">Enter 发送并分支</span>
                ) : null}
              </div>
              <div className="composer-toolbar-actions">
                {showContextRing ? (
                  <ContextUsage
                    messages={messages}
                    busy={busy}
                    selection={llmSelection}
                    compact={designerEmbed}
                  />
                ) : null}
                {busy ? (
                  <button
                    type="button"
                    className="composer-btn composer-btn--stop"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onStop();
                    }}
                    aria-label="停止生成"
                    title={queueLength > 0 ? "停止并清空排队" : "停止生成"}
                  >
                    <svg
                      className="composer-stop-icon"
                      width="20"
                      height="20"
                      viewBox="0 0 16 16"
                      aria-hidden
                    >
                      <path
                        fill="currentColor"
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M8 1.35a6.65 6.65 0 1 1 0 13.3 6.65 6.65 0 1 1 0-13.3ZM5.75 5.75h4.5v4.5h-4.5V5.75Z"
                      />
                    </svg>
                  </button>
                ) : null}
                <ComposerPrimaryActionButton
                  canSend={draftState.canSend}
                  agentBusy={busy}
                  phase={voiceInput.phase}
                  pluginStatus={voiceInput.pluginStatus}
                  canUseVoice={voiceInput.canUse}
                  onVoiceStart={voiceInput.startVoiceInput}
                  onVoiceStop={voiceInput.stopVoiceInput}
                  onVoiceSetup={handleVoiceSetup}
                  onVoiceStarting={notifyVoiceServiceStarting}
                />
              </div>
            </div>
          </div>
        </div>
      </form>
    </footer>
  );
});

export const ChatComposerFooter = memo(ChatComposerFooterInner);
