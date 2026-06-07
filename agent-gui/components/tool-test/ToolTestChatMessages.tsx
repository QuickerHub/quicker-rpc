"use client";

import type { RefObject } from "react";
import type { AgentUIMessage } from "@/lib/chat-types";
import { MessageParts } from "@/components/chat/MessageParts";

type ToolTestChatMessagesProps = {
  messages: AgentUIMessage[];
  workingDirectory?: string;
  emptyHint?: string;
  endRef?: RefObject<HTMLDivElement | null>;
};

export function ToolTestChatMessages({
  messages,
  workingDirectory,
  emptyHint,
  endRef,
}: ToolTestChatMessagesProps) {
  if (messages.length === 0) {
    return emptyHint ? (
      <p className="tool-test-chat-messages__empty">{emptyHint}</p>
    ) : null;
  }

  return (
    <div className="tool-test-chat-messages">
      {messages.map((message) => (
        <div key={message.id} className="msg-turn">
          {message.role === "user" ? (
            <article className="msg msg--user">
              <div className="msg-content">
                <MessageParts message={message} />
              </div>
            </article>
          ) : (
            <article className="msg msg--assistant">
              <div className="msg-content">
                <div className="parts">
                  <MessageParts
                    message={message}
                    workingDirectory={workingDirectory}
                  />
                </div>
              </div>
            </article>
          )}
        </div>
      ))}
      {endRef ? (
        <div ref={endRef} className="messages-anchor" aria-hidden />
      ) : null}
    </div>
  );
}
