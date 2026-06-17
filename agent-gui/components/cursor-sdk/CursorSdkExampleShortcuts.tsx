"use client";

import {
  CURSOR_SDK_EXAMPLE_GROUPS,
  type CursorSdkExample,
} from "@/lib/cursor-sdk/examples";

type CursorSdkExampleShortcutsProps = {
  disabled?: boolean;
  onFill: (text: string) => void;
  onSend: (text: string) => void;
};

export function CursorSdkExampleShortcuts({
  disabled = false,
  onFill,
  onSend,
}: CursorSdkExampleShortcutsProps) {
  return (
    <div
      className="empty-chat-shortcuts cursor-sdk-example-shortcuts"
      role="group"
      aria-label="Cursor SDK 示例"
    >
      {CURSOR_SDK_EXAMPLE_GROUPS.flatMap((group) =>
        group.examples.map((example: CursorSdkExample) => (
          <button
            key={example.id}
            type="button"
            className="empty-chat-shortcut-btn"
            disabled={disabled}
            onClick={() => onSend(example.text)}
            onContextMenu={(e) => {
              e.preventDefault();
              onFill(example.text);
            }}
          >
            <span className="empty-chat-shortcut-btn__label">
              {example.label}
              {example.readOnly ? (
                <span className="tool-test-prompt-chat-example__tag">只读</span>
              ) : null}
            </span>
            <span className="empty-chat-shortcut-btn__hint">{example.hint}</span>
          </button>
        )),
      )}
    </div>
  );
}
