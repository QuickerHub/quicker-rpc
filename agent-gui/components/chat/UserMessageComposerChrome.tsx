"use client";

import { forwardRef, type KeyboardEvent } from "react";
import type { AgentUIMessage } from "@/lib/chat-types";
import { MessageParts } from "./MessageParts";

export type UserMessageComposerChromeProps = {
  message: AgentUIMessage;
  userTextOverride?: string;
  messageId?: string;
  className?: string;
  interactive?: boolean;
  isEditAnchor?: boolean;
  title?: string;
  onClick?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
};

/** Composer chrome for in-flow user messages. */
export const UserMessageComposerChrome = forwardRef<
  HTMLDivElement,
  UserMessageComposerChromeProps
>(function UserMessageComposerChrome(
  {
    message,
    userTextOverride,
    messageId,
    className = "",
    interactive = false,
    isEditAnchor = false,
    title,
    onClick,
    onKeyDown,
  },
  ref,
) {
  const rootClass = [
    "composer-box",
    "user-message-composer",
    interactive ? "user-message-composer--interactive" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={ref}
      data-message-id={messageId}
      className={rootClass}
      role={interactive && !isEditAnchor ? "button" : undefined}
      tabIndex={interactive && !isEditAnchor ? 0 : undefined}
      title={title}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <div className="composer-surface">
        <div className="composer-field composer-field--markup user-message-composer__field">
          <div className="composer-inline-input-wrap">
            <div
              className="composer-inline-input user-message-composer__input"
              aria-readonly
            >
              <MessageParts
                message={message}
                userTextOverride={userTextOverride}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
