"use client";

import Link from "next/link";
import { useMemo } from "react";
import { DigitalAvatar } from "@/components/voice-chat/DigitalAvatar";
import { useVoiceChat } from "@/lib/voice-chat/use-voice-chat";
import type { VoiceChatPhase } from "@/lib/voice-chat/voice-chat-types";
import {
  isVoiceInputMockEnabled,
  voicePluginStatusLabel,
} from "@/lib/voice-input/voice-input-plugin-status";
import { useVoicePluginStatus } from "@/lib/voice-input/use-voice-plugin-status";

const PHASE_LABELS: Record<VoiceChatPhase, string> = {
  idle: "待命",
  connecting: "连接中…",
  listening: "正在听你说",
  thinking: "思考中…",
  speaking: "正在回复",
  error: "出错了",
};

export function VoiceChatPage() {
  const pluginStatus = useVoicePluginStatus(true);
  const voiceChat = useVoiceChat();
  const phaseLabel = PHASE_LABELS[voiceChat.phase];

  const statusLine = useMemo(() => {
    if (isVoiceInputMockEnabled()) {
      return "开发 Mock 模式（localStorage voice-input-mock=1）";
    }
    return `语音服务：${voicePluginStatusLabel(pluginStatus)}`;
  }, [pluginStatus]);

  return (
    <main className="voice-chat-page">
      <header className="voice-chat-page__header">
        <div>
          <h1 className="voice-chat-page__title">语音数字人对话</h1>
          <p className="voice-chat-page__subtitle">
            全双工试听：流式 LLM + 浏览器 TTS，支持说话打断。
          </p>
        </div>
        <Link href="/" className="voice-chat-page__back">
          返回主页
        </Link>
      </header>

      <section className="voice-chat-page__stage">
        <DigitalAvatar
          speaking={voiceChat.avatarSpeaking}
          phaseLabel={phaseLabel}
        />

        <div className="voice-chat-page__controls">
          {!voiceChat.isActive ? (
            <button
              type="button"
              className="voice-chat-page__btn voice-chat-page__btn--primary"
              disabled={!voiceChat.canStart}
              onClick={voiceChat.start}
            >
              开始对话
            </button>
          ) : (
            <>
              <button
                type="button"
                className="voice-chat-page__btn"
                onClick={voiceChat.bargeIn}
                disabled={
                  voiceChat.phase !== "speaking"
                  && voiceChat.phase !== "thinking"
                }
              >
                打断
              </button>
              <button
                type="button"
                className="voice-chat-page__btn voice-chat-page__btn--danger"
                onClick={voiceChat.stop}
              >
                结束
              </button>
            </>
          )}
        </div>

        <p className="voice-chat-page__hint">{statusLine}</p>
        {voiceChat.error ? (
          <p className="voice-chat-page__error" role="alert">
            {voiceChat.error}
            <button
              type="button"
              className="voice-chat-page__error-dismiss"
              onClick={voiceChat.clearError}
            >
              关闭
            </button>
          </p>
        ) : null}
      </section>

      <section className="voice-chat-page__transcript">
        {voiceChat.partialText ? (
          <p className="voice-chat-page__partial">
            <span>识别中</span>
            {voiceChat.partialText}
          </p>
        ) : null}
        {voiceChat.assistantDraft ? (
          <p className="voice-chat-page__draft">
            <span>回复草稿</span>
            {voiceChat.assistantDraft}
          </p>
        ) : null}
        <ul className="voice-chat-page__messages">
          {voiceChat.messages.map((message) => (
            <li
              key={message.id}
              className={`voice-chat-page__message voice-chat-page__message--${message.role}`}
            >
              <span>{message.role === "user" ? "你" : "助手"}</span>
              {message.text}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
