"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  mockStreamVoiceSession,
  startMockVoicePartialSession,
  type MockVoicePartialSession,
} from "@/lib/voice-input/voice-input-mock";
import {
  canUseVoiceInput,
  isVoiceInputMockEnabled,
  voicePluginStatusLabel,
} from "@/lib/voice-input/voice-input-plugin-status";
import { useVoicePluginStatus } from "@/lib/voice-input/use-voice-plugin-status";
import { VoiceMicRecorder } from "@/lib/voice-input/voice-input-recorder";
import { VoiceWsSession } from "@/lib/voice-input/voice-input-ws-client";
import {
  broadcastVoiceInterrupt,
  createVoiceCoordinationSourceId,
  subscribeVoiceInterrupt,
} from "@/lib/voice-input/voice-input-coordination";
import type {
  VoicePluginStatus,
  VoiceSessionPhase,
  VoiceTranscribeResult,
} from "@/lib/voice-input/voice-input-types";

const MAX_RECORDING_MS = 120_000;
const TRANSCRIBE_TIMEOUT_MS = 15_000;

type VoiceLiveSession = {
  endSession(): Promise<VoiceTranscribeResult>;
  cancel(reason?: string): void;
  close(): void;
  detachAbortSignal(): void;
};

function canStartVoiceCapture(status: VoicePluginStatus): boolean {
  if (isVoiceInputMockEnabled()) return true;
  return canUseVoiceInput(status);
}
export type UseVoiceInputOptions = {
  enabled?: boolean;
  onStreamBegin: () => void;
  onStreamUpdate: (text: string) => void;
  onStreamEnd: (finalText: string) => void;
  /** Keep partial voice text in composer when user edits via keyboard. */
  onStreamInterrupt?: () => void;
  onStreamCancel?: () => void;
};

export type UseVoiceInputResult = {
  phase: VoiceSessionPhase;
  pluginStatus: VoicePluginStatus;
  canUse: boolean;
  statusHint: string | null;
  errorHint: string | null;
  startVoiceInput: () => void;
  stopVoiceInput: () => void;
  /** Stop recording/transcribing without waiting for final ASR (user typed in composer). */
  interruptVoiceInput: () => void;
  clearError: () => void;
};

export function useVoiceInput(options: UseVoiceInputOptions): UseVoiceInputResult {
  const {
    enabled = true,
    onStreamBegin,
    onStreamUpdate,
    onStreamEnd,
    onStreamInterrupt,
    onStreamCancel,
  } = options;

  const onStreamBeginRef = useRef(onStreamBegin);
  const onStreamUpdateRef = useRef(onStreamUpdate);
  const onStreamEndRef = useRef(onStreamEnd);
  const onStreamInterruptRef = useRef(onStreamInterrupt);
  const onStreamCancelRef = useRef(onStreamCancel);
  onStreamBeginRef.current = onStreamBegin;
  onStreamUpdateRef.current = onStreamUpdate;
  onStreamEndRef.current = onStreamEnd;
  onStreamInterruptRef.current = onStreamInterrupt;
  onStreamCancelRef.current = onStreamCancel;

  const pluginStatus = useVoicePluginStatus(true);
  const [phase, setPhase] = useState<VoiceSessionPhase>("idle");
  const [statusHint, setStatusHint] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const recordStartedAtRef = useRef(0);
  const streamStartedRef = useRef(false);
  const maxRecordTimerRef = useRef<number | null>(null);
  const errorTimerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const recorderRef = useRef<VoiceMicRecorder | null>(null);
  const voiceSessionRef = useRef<VoiceLiveSession | null>(null);
  const setupPromiseRef = useRef<Promise<void> | null>(null);
  const mockPartialRef = useRef<MockVoicePartialSession | null>(null);
  const interruptedByUserEditRef = useRef(false);
  const voiceSourceIdRef = useRef(createVoiceCoordinationSourceId());

  const pushStreamText = useCallback((text: string) => {
    if (!text.trim()) return;
    if (!streamStartedRef.current) {
      streamStartedRef.current = true;
      onStreamBeginRef.current();
    }
    onStreamUpdateRef.current(text);
  }, []);

  const clearTimers = useCallback(() => {
    if (maxRecordTimerRef.current !== null) {
      window.clearTimeout(maxRecordTimerRef.current);
      maxRecordTimerRef.current = null;
    }
  }, []);

  const cleanupLiveSession = useCallback(() => {
    mockPartialRef.current?.stop();
    mockPartialRef.current = null;
    recorderRef.current?.dispose();
    recorderRef.current = null;
    voiceSessionRef.current?.close();
    voiceSessionRef.current = null;
    abortRef.current = null;
  }, []);

  const showError = useCallback((message: string) => {
    setErrorHint(message);
    if (errorTimerRef.current !== null) {
      window.clearTimeout(errorTimerRef.current);
    }
    errorTimerRef.current = window.setTimeout(() => {
      setErrorHint(null);
      errorTimerRef.current = null;
    }, 4000);
  }, []);

  const clearError = useCallback(() => {
    setErrorHint(null);
    if (errorTimerRef.current !== null) {
      window.clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
  }, []);

  const finishMockSession = useCallback(
    async (recordedMs: number, signal: AbortSignal) => {
      const mockPartial = mockPartialRef.current;
      mockPartialRef.current = null;
      mockPartial?.stop();

      const finalText = mockPartial?.finalText ?? "";
      const result = await mockStreamVoiceSession({
        signal,
        recordedMs,
        language: "zh-CN",
        finalText,
        onPartial: (text) => pushStreamText(text),
      });

      if (!result.text.trim()) {
        onStreamCancelRef.current?.();
        showError("未识别到内容，请重试");
        return;
      }
      onStreamEndRef.current(result.text);
    },
    [pushStreamText, showError],
  );

  const finishRuntimeSession = useCallback(
    async (signal: AbortSignal) => {
      const recorder = recorderRef.current;
      const voiceSession = voiceSessionRef.current;
      if (!recorder || !voiceSession) {
        return;
      }

      await recorder.stop();
      recorderRef.current = null;

      const result = await voiceSession.endSession();
      voiceSessionRef.current = null;

      if (signal.aborted) return;
      if (!result.text.trim()) {
        onStreamCancelRef.current?.();
        showError("未识别到内容，请重试");
        return;
      }
      pushStreamText(result.text);
      onStreamEndRef.current(result.text);
    },
    [pushStreamText, showError],
  );

  const finishSession = useCallback(async () => {
    if (phaseRef.current !== "recording") return;

    clearTimers();
    const recordedMs = Math.max(0, Date.now() - recordStartedAtRef.current);

    // Only abort in-flight WS/mic setup — never tear down an established session.
    if (setupPromiseRef.current) {
      abortRef.current?.abort();
    }

    setPhase("transcribing");
    setStatusHint("识别中…");

    const controller = new AbortController();
    abortRef.current = controller;

    const timeoutId = window.setTimeout(() => {
      controller.abort();
      voiceSessionRef.current?.cancel("timeout");
    }, TRANSCRIBE_TIMEOUT_MS);

    try {
      if (isVoiceInputMockEnabled()) {
        await finishMockSession(recordedMs, controller.signal);
      } else {
        if (setupPromiseRef.current) {
          try {
            await setupPromiseRef.current;
          } catch {
            onStreamCancelRef.current?.();
            return;
          }
        }
        if (!recorderRef.current || !voiceSessionRef.current) {
          onStreamCancelRef.current?.();
          return;
        }
        await finishRuntimeSession(controller.signal);
      }
    } catch (err) {
      cleanupLiveSession();
      onStreamCancelRef.current?.();
      if (interruptedByUserEditRef.current) {
        interruptedByUserEditRef.current = false;
        return;
      }
      if (err instanceof DOMException && err.name === "AbortError") {
        showError("识别超时，请重试");
      } else {
        const message =
          err instanceof Error ? err.message : "语音识别失败，请重试";
        showError(message);
      }
    } finally {
      cleanupLiveSession();
      streamStartedRef.current = false;
      window.clearTimeout(timeoutId);
      abortRef.current = null;
      setPhase("idle");
      setStatusHint(null);
    }
  }, [
    cleanupLiveSession,
    clearTimers,
    finishMockSession,
    finishRuntimeSession,
    showError,
  ]);

  const stopVoiceInput = useCallback(() => {
    const phase = phaseRef.current;
    if (phase === "idle") return;
    if (phase === "transcribing") {
      clearTimers();
      abortRef.current?.abort();
      voiceSessionRef.current?.cancel("user_stop");
      cleanupLiveSession();
      setupPromiseRef.current = null;
      streamStartedRef.current = false;
      setPhase("idle");
      setStatusHint(null);
      return;
    }
    void finishSession();
  }, [cleanupLiveSession, clearTimers, finishSession]);

  const interruptVoiceInput = useCallback(() => {
    const phase = phaseRef.current;
    if (phase !== "recording" && phase !== "transcribing") return;

    interruptedByUserEditRef.current = true;
    clearTimers();
    abortRef.current?.abort();
    abortRef.current = null;
    setupPromiseRef.current = null;

    mockPartialRef.current?.stop();
    mockPartialRef.current = null;
    cleanupLiveSession();

    if (streamStartedRef.current) {
      onStreamInterruptRef.current?.();
    } else {
      onStreamCancelRef.current?.();
    }

    streamStartedRef.current = false;
    setPhase("idle");
    setStatusHint(null);
  }, [cleanupLiveSession, clearTimers]);

  const startVoiceInput = useCallback(() => {
    if (!enabled) return;
    if (phaseRef.current !== "idle") return;
    if (!canStartVoiceCapture(pluginStatus)) {
      showError(`语音不可用：${voicePluginStatusLabel(pluginStatus)}`);
      return;
    }

    broadcastVoiceInterrupt(voiceSourceIdRef.current);

    clearError();
    streamStartedRef.current = false;
    recordStartedAtRef.current = Date.now();
    setPhase("recording");
    setStatusHint(
      isVoiceInputMockEnabled()
        ? "mock 演示：自动填充样例文本"
        : "正在听…",
    );

    maxRecordTimerRef.current = window.setTimeout(() => {
      void finishSession();
    }, MAX_RECORDING_MS);

    if (isVoiceInputMockEnabled()) {
      mockPartialRef.current = startMockVoicePartialSession((text) => {
        if (phaseRef.current === "recording") {
          pushStreamText(text);
        }
      });
      return;
    }

    void (async () => {
      const controller = new AbortController();
      abortRef.current = controller;

      const setup = (async () => {
        const wsSession = new VoiceWsSession({
          language: "zh-CN",
          streaming: true,
          signal: controller.signal,
          onPartial: (text) => {
            if (phaseRef.current === "recording") {
              pushStreamText(text);
            }
          },
        });
        await wsSession.connect();
        await wsSession.startSession();
        voiceSessionRef.current = wsSession;

        const recorder = new VoiceMicRecorder();
        await recorder.start((chunk) => wsSession.sendAudio(chunk));
        recorderRef.current = recorder;
      })();

      setupPromiseRef.current = setup;

      try {
        await setup;
        voiceSessionRef.current?.detachAbortSignal();
        if (phaseRef.current !== "recording") {
          cleanupLiveSession();
        } else {
          abortRef.current = null;
        }
      } catch (err) {
        cleanupLiveSession();
        onStreamCancelRef.current?.();
        streamStartedRef.current = false;
        if (phaseRef.current !== "recording") return;
        setPhase("idle");
        setStatusHint(null);
        clearTimers();
        const message =
          err instanceof Error ? err.message : "无法启动麦克风或语音服务";
        showError(message);
      } finally {
        if (setupPromiseRef.current === setup) {
          setupPromiseRef.current = null;
        }
      }
    })();
  }, [
    cleanupLiveSession,
    clearError,
    clearTimers,
    enabled,
    finishSession,
    pluginStatus,
    pushStreamText,
    showError,
  ]);

  useEffect(() => {
    return subscribeVoiceInterrupt(voiceSourceIdRef.current, () => {
      interruptVoiceInput();
    });
  }, [interruptVoiceInput]);

  useEffect(() => {
    return () => {
      clearTimers();
      abortRef.current?.abort();
      cleanupLiveSession();
      if (errorTimerRef.current !== null) {
        window.clearTimeout(errorTimerRef.current);
      }
    };
  }, [cleanupLiveSession, clearTimers]);

  const canUse = enabled && canStartVoiceCapture(pluginStatus);

  return {
    phase,
    pluginStatus,
    canUse,
    statusHint,
    errorHint,
    startVoiceInput,
    stopVoiceInput,
    interruptVoiceInput,
    clearError,
  };
}

export {
  voiceInputButtonTitle,
  voiceInputStopRecordingTitle,
  voiceInputToggleAriaKeyshortcuts,
} from "@/lib/voice-input/voice-input-shortcuts";
