"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DuplexAsrLoop } from "@/lib/voice-chat/duplex-asr-loop";
import { MicEnergyGate } from "@/lib/voice-chat/mic-energy";
import {
  drainSpeakableChunks,
  flushSpeakableChunk,
} from "@/lib/voice-chat/sentence-chunker";
import { streamVoiceChatReply } from "@/lib/voice-chat/stream-llm-reply";
import { TtsPlayer } from "@/lib/voice-chat/tts-player";
import type {
  VoiceChatMessage,
  VoiceChatPhase,
  VoiceChatTurn,
} from "@/lib/voice-chat/voice-chat-types";
import {
  canUseVoiceInput,
  isVoiceInputMockEnabled,
} from "@/lib/voice-input/voice-input-plugin-status";
import { useVoicePluginStatus } from "@/lib/voice-input/use-voice-plugin-status";

const BARGE_IN_PARTIAL_DELTA = 3;

function createMessage(
  role: VoiceChatTurn["role"],
  text: string,
): VoiceChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    text,
    at: Date.now(),
  };
}

export type UseVoiceChatOptions = {
  llmSelection?: string;
};

export type UseVoiceChatResult = {
  phase: VoiceChatPhase;
  messages: VoiceChatMessage[];
  partialText: string;
  assistantDraft: string;
  avatarSpeaking: boolean;
  error: string | null;
  canStart: boolean;
  isActive: boolean;
  start: () => void;
  stop: () => void;
  bargeIn: () => void;
  clearError: () => void;
};

export function useVoiceChat(options: UseVoiceChatOptions = {}): UseVoiceChatResult {
  const pluginStatus = useVoicePluginStatus(true);
  const [phase, setPhase] = useState<VoiceChatPhase>("idle");
  const [messages, setMessages] = useState<VoiceChatMessage[]>([]);
  const [partialText, setPartialText] = useState("");
  const [assistantDraft, setAssistantDraft] = useState("");
  const [avatarSpeaking, setAvatarSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const historyRef = useRef<VoiceChatTurn[]>([]);
  const asrLoopRef = useRef<DuplexAsrLoop | null>(null);
  const ttsRef = useRef<TtsPlayer | null>(null);
  const llmAbortRef = useRef<AbortController | null>(null);
  const sessionAbortRef = useRef<AbortController | null>(null);
  const energyGateRef = useRef<MicEnergyGate | null>(null);
  const speakingPartialBaselineRef = useRef("");

  const canStart =
    isVoiceInputMockEnabled() || canUseVoiceInput(pluginStatus);

  const cleanupSession = useCallback(() => {
    llmAbortRef.current?.abort();
    llmAbortRef.current = null;
    sessionAbortRef.current?.abort();
    sessionAbortRef.current = null;
    void asrLoopRef.current?.stop();
    asrLoopRef.current = null;
    ttsRef.current?.dispose();
    ttsRef.current = null;
    energyGateRef.current = null;
  }, []);

  const bargeIn = useCallback(() => {
    if (phaseRef.current !== "speaking" && phaseRef.current !== "thinking") {
      return;
    }
    llmAbortRef.current?.abort();
    llmAbortRef.current = null;
    ttsRef.current?.flush();
    energyGateRef.current?.disarm();
    asrLoopRef.current?.resumeUtteranceDetection();
    void asrLoopRef.current?.restartCycle();
    setPartialText("");
    setAssistantDraft("");
    speakingPartialBaselineRef.current = "";
    setPhase("listening");
  }, []);

  const handleUtterance = useCallback(
    async (text: string) => {
      if (
        phaseRef.current === "thinking"
        || phaseRef.current === "speaking"
      ) {
        return;
      }

      const utterance = text.trim();
      if (!utterance) return;

      setMessages((prev) => [...prev, createMessage("user", utterance)]);
      historyRef.current = [
        ...historyRef.current,
        { role: "user", text: utterance },
      ];
      setPartialText("");
      setAssistantDraft("");
      setPhase("thinking");
      asrLoopRef.current?.pauseUtteranceDetection();

      const llmAbort = new AbortController();
      llmAbortRef.current = llmAbort;

      const tts =
        ttsRef.current
        ?? new TtsPlayer({
          onSpeakingChange: (speaking) => {
            setAvatarSpeaking(speaking);
            if (speaking) {
              setPhase("speaking");
              asrLoopRef.current?.pauseUtteranceDetection();
              speakingPartialBaselineRef.current = "";
              energyGateRef.current?.reset();
            } else if (phaseRef.current === "speaking") {
              asrLoopRef.current?.resumeUtteranceDetection();
              energyGateRef.current?.disarm();
              setPhase("listening");
            }
          },
        });
      ttsRef.current = tts;

      let streamBuffer = "";
      let assistantText = "";

      try {
        assistantText = await streamVoiceChatReply({
          userText: utterance,
          history: historyRef.current.slice(0, -1),
          llmSelection: options.llmSelection,
          signal: llmAbort.signal,
          onTextDelta: (_delta, fullText) => {
            if (llmAbort.signal.aborted) return;
            assistantText = fullText;
            setAssistantDraft(fullText);
            streamBuffer += _delta;
            const { chunks, rest } = drainSpeakableChunks(streamBuffer);
            streamBuffer = rest;
            for (const chunk of chunks) {
              tts.enqueue(chunk);
            }
          },
        });

        if (llmAbort.signal.aborted) return;

        const tail = flushSpeakableChunk(streamBuffer);
        if (tail) tts.enqueue(tail);

        const finalAssistant = assistantText.trim();
        if (finalAssistant) {
          setMessages((prev) => [
            ...prev,
            createMessage("assistant", finalAssistant),
          ]);
          historyRef.current = [
            ...historyRef.current,
            { role: "assistant", text: finalAssistant },
          ];
        }
        setAssistantDraft("");

        if (!tts.isSpeaking) {
          asrLoopRef.current?.resumeUtteranceDetection();
          setPhase("listening");
        }
      } catch (err) {
        if (llmAbort.signal.aborted) return;
        const message =
          err instanceof Error ? err.message : "语音对话失败";
        setError(message);
        setPhase("error");
        tts.flush();
        asrLoopRef.current?.resumeUtteranceDetection();
      } finally {
        if (llmAbortRef.current === llmAbort) {
          llmAbortRef.current = null;
        }
      }
    },
    [options.llmSelection],
  );

  const start = useCallback(() => {
    if (!canStart || phaseRef.current !== "idle") return;
    setError(null);
    setPhase("connecting");
    cleanupSession();

    const sessionAbort = new AbortController();
    sessionAbortRef.current = sessionAbort;

    const energyGate = new MicEnergyGate({
      onTrigger: () => bargeIn(),
    });
    energyGateRef.current = energyGate;

    const asrLoop = new DuplexAsrLoop({
      signal: sessionAbort.signal,
      onPartial: (text) => {
        setPartialText(text);
        if (phaseRef.current === "speaking") {
          const baseline = speakingPartialBaselineRef.current;
          if (!baseline) {
            speakingPartialBaselineRef.current = text;
            return;
          }
          if (text.length >= baseline.length + BARGE_IN_PARTIAL_DELTA) {
            bargeIn();
          }
        }
      },
      onUtterance: (text) => {
        void handleUtterance(text);
      },
      onAudioFrame: (frame) => {
        if (phaseRef.current === "speaking") {
          energyGate.handleFrame(frame);
        }
      },
    });
    asrLoopRef.current = asrLoop;

    void (async () => {
      try {
        await asrLoop.start();
        if (sessionAbort.signal.aborted) return;
        setPhase("listening");
      } catch (err) {
        if (sessionAbort.signal.aborted) return;
        const message =
          err instanceof Error ? err.message : "无法启动语音对话";
        setError(message);
        setPhase("error");
        cleanupSession();
      }
    })();
  }, [bargeIn, canStart, cleanupSession, handleUtterance]);

  const stop = useCallback(() => {
    cleanupSession();
    setPartialText("");
    setAssistantDraft("");
    setAvatarSpeaking(false);
    setPhase("idle");
  }, [cleanupSession]);

  const clearError = useCallback(() => {
    setError(null);
    if (phaseRef.current === "error") {
      setPhase("idle");
    }
  }, []);

  useEffect(() => () => cleanupSession(), [cleanupSession]);

  return {
    phase,
    messages,
    partialText,
    assistantDraft,
    avatarSpeaking,
    error,
    canStart,
    isActive: phase !== "idle" && phase !== "error",
    start,
    stop,
    bargeIn,
    clearError,
  };
}
