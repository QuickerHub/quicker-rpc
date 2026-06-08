"use client";

import { memo, type KeyboardEvent } from "react";
import type { AgentUIMessage } from "@/lib/chat-types";
import { LastMessageMoreMenu } from "./LastMessageMoreMenu";
import { MessageParts } from "./MessageParts";
import { UserMessageComposerChrome } from "./UserMessageComposerChrome";

export type ChatMessageArticleProps = {
  message: AgentUIMessage;
  messageIndex: number;
  stickyPrompt?: boolean;
  isEditAnchor: boolean;
  editAnchorLiveDraft?: string;
  isAfterEditAnchor: boolean;
  hasLocalDraft: boolean;
  userEditable: boolean;
  isLastMessage: boolean;
  isColdMessage: boolean;
  agentActivity: boolean;
  workingDirectory: string;
  userMessageDisplayText: string;
  onBeginEdit: (message: AgentUIMessage) => void;
  onFocusComposerAtEnd: () => void;
  onInsertComposerPrompt: (text: string) => void;
};

function ChatMessageArticleInner({
  message,
  stickyPrompt = false,
  isEditAnchor,
  editAnchorLiveDraft,
  isAfterEditAnchor,
  hasLocalDraft,
  userEditable,
  isLastMessage,
  isColdMessage,
  agentActivity,
  workingDirectory,
  userMessageDisplayText,
  onBeginEdit,
  onFocusComposerAtEnd,
  onInsertComposerPrompt,
}: ChatMessageArticleProps) {
  const isUser = message.role === "user";

  const userText = isUser
    ? isEditAnchor
      ? editAnchorLiveDraft ?? userMessageDisplayText
      : userMessageDisplayText
    : undefined;

  const lastMessageMenu = isLastMessage ? (
    <LastMessageMoreMenu message={message} userTextOverride={userText} />
  ) : null;

  if (isUser) {
    const userArticleClass = `msg msg--user${isLastMessage && !agentActivity ? " msg--last" : ""}${isColdMessage ? " msg--cold" : ""}${isEditAnchor ? " msg--edit-anchor" : ""}${hasLocalDraft ? " msg--local-draft" : ""}${isAfterEditAnchor ? " msg--branch-cutoff" : ""}`;
    const userComposer = (
      <UserMessageComposerChrome
        message={message}
        messageId={message.id}
        userTextOverride={userText}
        interactive={userEditable && !isEditAnchor}
        isEditAnchor={isEditAnchor}
        title={
          isEditAnchor
            ? "在下方输入框编辑；Enter 发送并从此处继续"
            : userEditable
              ? "点击在下方输入框编辑；失焦保存草稿"
              : undefined
        }
        onClick={
          isEditAnchor
            ? () => onFocusComposerAtEnd()
            : userEditable
              ? () => onBeginEdit(message)
              : undefined
        }
        onKeyDown={
          userEditable && !isEditAnchor
            ? (event: KeyboardEvent<HTMLDivElement>) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onBeginEdit(message);
                }
              }
            : undefined
        }
      />
    );

    if (stickyPrompt) {
      return (
        <div key={message.id} className="msg-turn__prompt msg-turn__prompt--sticky">
          <article className={userArticleClass}>
            {userComposer}
            {lastMessageMenu}
          </article>
        </div>
      );
    }

    return (
      <article key={message.id} className={userArticleClass}>
        {userComposer}
        {lastMessageMenu}
      </article>
    );
  }

  return (
    <article
      key={message.id}
      className={`msg msg--assistant${isLastMessage && !agentActivity ? " msg--last" : ""}${isColdMessage ? " msg--cold" : ""}${isEditAnchor ? " msg--edit-anchor" : ""}${hasLocalDraft ? " msg--local-draft" : ""}${isAfterEditAnchor ? " msg--branch-cutoff" : ""}`}
    >
      <div className="msg-content">
        <div className="parts">
          <MessageParts
            message={message}
            workingDirectory={workingDirectory}
            onInsertComposerPrompt={onInsertComposerPrompt}
          />
        </div>
        {lastMessageMenu}
      </div>
    </article>
  );
}

export const ChatMessageArticle = memo(ChatMessageArticleInner);
