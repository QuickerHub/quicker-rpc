"use client";

import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  ComposerMarkupField,
  type ComposerMarkupFieldHandle,
} from "@/components/chat/ComposerMarkupField";
import {
  CursorSdkModelPicker,
  type CursorSdkModelOption,
} from "@/components/cursor-sdk/CursorSdkModelPicker";
import { CursorSdkExampleShortcuts } from "@/components/cursor-sdk/CursorSdkExampleShortcuts";
import { canSendComposedMessage } from "@/lib/compose-user-message";

function ComposerSendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 4v8M8 4l3.5 3.5M8 4 4.5 7.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ComposerStopIcon() {
  return (
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
  );
}

export type CursorSdkComposerHandle = {
  focus: () => void;
  focusAtEnd: () => void;
  setValue: (text: string) => void;
  clear: () => void;
  insertPlainText: (text: string) => void;
};

type CursorSdkComposerProps = {
  isEmptyThread: boolean;
  busy: boolean;
  configured: boolean;
  statusLoaded?: boolean;
  modelId: string;
  modelOptions: CursorSdkModelOption[];
  onModelChange: (modelId: string) => void;
  onSubmit: (text: string) => void;
  onStop: () => void;
  onNewSession: () => void;
  newSessionBusy?: boolean;
  workingDirectory?: string;
};

const CursorSdkComposerInner = forwardRef<
  CursorSdkComposerHandle,
  CursorSdkComposerProps
>(function CursorSdkComposerInner(
  {
    isEmptyThread,
    busy,
    configured,
    statusLoaded = true,
    modelId,
    modelOptions,
    onModelChange,
    onSubmit,
    onStop,
    onNewSession,
    newSessionBusy = false,
    workingDirectory,
  },
  ref,
) {
  const [draft, setDraft] = useState("");
  const composerRef = useRef<ComposerMarkupFieldHandle>(null);
  const canSend = canSendComposedMessage(draft) && configured && !busy;

  const handleSubmit = useCallback(() => {
    const text = composerRef.current?.getValue().trim() ?? draft.trim();
    if (!canSendComposedMessage(text) || !configured || busy) return;
    onSubmit(text);
    setDraft("");
  }, [busy, configured, draft, onSubmit]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => composerRef.current?.focus(),
      focusAtEnd: () => composerRef.current?.focusAtEnd(),
      setValue: (text: string) => {
        setDraft(text);
        requestAnimationFrame(() => composerRef.current?.focusAtEnd());
      },
      clear: () => {
        setDraft("");
      },
      insertPlainText: (text: string) => {
        composerRef.current?.insertPlainText(text);
        setDraft(composerRef.current?.getValue() ?? text);
      },
    }),
    [],
  );

  return (
    <footer className="composer composer--cursor-sdk">
      {isEmptyThread ? (
        <CursorSdkExampleShortcuts
          disabled={busy || !configured}
          onFill={(text) => {
            setDraft(text);
            requestAnimationFrame(() => composerRef.current?.focusAtEnd());
          }}
          onSend={(text) => onSubmit(text)}
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
              value={draft}
              workingDirectory={workingDirectory}
              enableSlashCommands={false}
              placeholder="描述要执行的 Quicker 编写任务…（Enter 发送）"
              onChange={setDraft}
              onSubmit={handleSubmit}
            />
            <div className="composer-toolbar">
              <div className="composer-toolbar-left">
                <CursorSdkModelPicker
                  modelId={modelId}
                  options={modelOptions}
                  disabled={busy || newSessionBusy}
                  onChange={onModelChange}
                />
                <button
                  type="button"
                  className="tool-selector-trigger composer-cursor-sdk-new-session"
                  disabled={busy || newSessionBusy}
                  title="释放 SDK Agent 并清空对话"
                  onClick={onNewSession}
                >
                  新会话
                </button>
                {statusLoaded && !configured ? (
                  <span className="composer-hint composer-hint--warn">
                    未配置 CURSOR_API_KEY
                  </span>
                ) : null}
              </div>
              <div className="composer-toolbar-actions">
                {busy ? (
                  <button
                    type="button"
                    className="composer-btn composer-btn--stop"
                    onClick={onStop}
                    aria-label="停止生成"
                    title="停止生成"
                  >
                    <ComposerStopIcon />
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="composer-btn composer-btn--send composer-btn--primary-action"
                    disabled={!canSend}
                    aria-label="发送"
                    title="发送（Enter）"
                  >
                    <ComposerSendIcon />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </form>
    </footer>
  );
});

export const CursorSdkComposer = memo(CursorSdkComposerInner);
