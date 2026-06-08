"use client";

import type { MouseEvent } from "react";

import { isVoiceRuntimeWarmingUp } from "@/lib/voice-input/voice-input-plugin-status";
import type { VoicePluginStatus, VoiceSessionPhase } from "@/lib/voice-input/voice-input-types";
import {
  voiceInputButtonTitle,
  voiceInputStopRecordingTitle,
  voiceInputToggleAriaKeyshortcuts,
} from "@/lib/voice-input/use-voice-input";
import { useShellPlatform } from "@/lib/tauri-shell";
import { ComposerVoiceIcon } from "@/components/chat/ComposerVoiceIcon";
import { ComposerVoiceWaveform } from "@/components/chat/ComposerVoiceWaveform";

type ComposerPrimaryActionButtonProps = {
  /** When true, show send (submit) alongside voice when idle. */
  canSend: boolean;
  agentBusy?: boolean;
  phase: VoiceSessionPhase;
  pluginStatus: VoicePluginStatus;
  canUseVoice: boolean;
  disabled?: boolean;
  onVoiceStart: () => void;
  onVoiceStop: () => void;
  /** When voice runtime is not ready (install / start). */
  onVoiceSetup?: () => void;
  /** When runtime is booting (installed / starting). */
  onVoiceStarting?: () => void;
};

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

function ComposerSendButton({
  disabled,
  agentBusy = false,
  muted = false,
}: {
  disabled?: boolean;
  agentBusy?: boolean;
  muted?: boolean;
}) {
  const sendLabel = agentBusy ? "加入发送队列" : "发送";
  return (
    <button
      type="submit"
      className={[
        "composer-btn",
        "composer-btn--send",
        "composer-btn--primary-action",
        muted ? "composer-btn--send-muted" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      disabled={disabled}
      aria-label={sendLabel}
      title={sendLabel}
    >
      <ComposerSendIcon />
    </button>
  );
}

function ComposerVoiceStopDiskButton({
  disabled,
  title,
  ariaKeyshortcuts,
  onClick,
}: {
  disabled?: boolean;
  title: string;
  ariaKeyshortcuts?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="composer-btn composer-btn--voice-stop-disk composer-btn--primary-action"
      disabled={disabled}
      aria-label={title}
      aria-keyshortcuts={ariaKeyshortcuts}
      title={title}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
    >
      <span className="composer-stop-square" aria-hidden />
    </button>
  );
}

function ComposerVoiceRecordingToolbar({
  phase,
  canSend,
  agentBusy,
  disabled,
  platform,
  onVoiceStop,
}: {
  phase: VoiceSessionPhase;
  canSend: boolean;
  agentBusy?: boolean;
  disabled?: boolean;
  platform: ReturnType<typeof useShellPlatform>;
  onVoiceStop: () => void;
}) {
  const recording = phase === "recording";
  const transcribing = phase === "transcribing";
  const sendDisabled = disabled || recording || transcribing || !canSend;
  const stopTitle = voiceInputStopRecordingTitle(platform);
  const stopKeyshortcuts = voiceInputToggleAriaKeyshortcuts(platform);

  return (
    <div className="composer-voice-toolbar" role="group" aria-label="语音输入控制">
      <div className="composer-voice-level" aria-hidden={transcribing}>
        <ComposerVoiceWaveform active={recording} busy={transcribing} />
        <span className="composer-voice-level-chevron" aria-hidden>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>

      {recording ? (
        <ComposerVoiceStopDiskButton
          disabled={disabled}
          title={stopTitle}
          ariaKeyshortcuts={stopKeyshortcuts}
          onClick={onVoiceStop}
        />
      ) : null}

      <ComposerSendButton
        disabled={sendDisabled}
        agentBusy={agentBusy}
        muted={recording || transcribing || !canSend}
      />
    </div>
  );
}

function ComposerVoiceMicButton({
  phase,
  pluginStatus,
  canUseVoice,
  disabled,
  platform,
  onVoiceStart,
  onVoiceSetup,
  onVoiceStarting,
}: {
  phase: VoiceSessionPhase;
  pluginStatus: VoicePluginStatus;
  canUseVoice: boolean;
  disabled?: boolean;
  platform: ReturnType<typeof useShellPlatform>;
  onVoiceStart: () => void;
  onVoiceSetup?: () => void;
  onVoiceStarting?: () => void;
}) {
  const voiceBusy = phase === "transcribing";
  const warmingUp = isVoiceRuntimeWarmingUp(pluginStatus);
  const needsSetup = !canUseVoice && !voiceBusy && !warmingUp;
  const title = voiceInputButtonTitle(
    pluginStatus,
    phase,
    canUseVoice && !disabled,
    platform,
  );
  const showShortcutHint = canUseVoice && !disabled && !voiceBusy;
  const ariaKeyshortcuts = showShortcutHint
    ? voiceInputToggleAriaKeyshortcuts(platform)
    : undefined;

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (disabled || voiceBusy) return;
    event.preventDefault();

    if (warmingUp) {
      onVoiceStarting?.();
      return;
    }

    if (needsSetup) {
      onVoiceSetup?.();
      return;
    }

    onVoiceStart();
  };

  const className = [
    "composer-btn",
    "composer-btn--voice",
    "composer-btn--primary-action",
    needsSetup ? "composer-btn--voice-setup" : "",
    warmingUp ? "composer-btn--voice-starting" : "",
    voiceBusy ? "composer-btn--voice-busy" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      disabled={disabled || voiceBusy}
      aria-disabled={warmingUp || disabled || voiceBusy}
      aria-label={title}
      aria-keyshortcuts={ariaKeyshortcuts}
      title={title}
      onClick={handleClick}
    >
      <ComposerVoiceIcon busy={voiceBusy || warmingUp} />
    </button>
  );
}

export function ComposerPrimaryActionButton({
  canSend,
  agentBusy = false,
  phase,
  pluginStatus,
  canUseVoice,
  disabled = false,
  onVoiceStart,
  onVoiceStop,
  onVoiceSetup,
  onVoiceStarting,
}: ComposerPrimaryActionButtonProps) {
  const platform = useShellPlatform();
  const voiceRecording = phase === "recording";
  const voiceBusy = phase === "transcribing";

  if (voiceRecording || voiceBusy) {
    return (
      <ComposerVoiceRecordingToolbar
        phase={phase}
        canSend={canSend}
        agentBusy={agentBusy}
        disabled={disabled}
        platform={platform}
        onVoiceStop={onVoiceStop}
      />
    );
  }

  return (
    <div className="composer-primary-actions">
      <ComposerVoiceMicButton
        phase={phase}
        pluginStatus={pluginStatus}
        canUseVoice={canUseVoice}
        disabled={disabled}
        platform={platform}
        onVoiceStart={onVoiceStart}
        onVoiceSetup={onVoiceSetup}
        onVoiceStarting={onVoiceStarting}
      />
      {canSend ? (
        <ComposerSendButton disabled={disabled} agentBusy={agentBusy} />
      ) : null}
    </div>
  );
}
