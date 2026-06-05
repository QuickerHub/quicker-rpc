"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { computeFloatingMenuLayout } from "@/lib/floating-menu-layout";
import { useMountedAriaControlsId } from "@/lib/use-mounted-aria-controls-id";
import { COMPOSER_TEST_PROMPT_GROUPS } from "@/lib/composer-test-prompts";
import type { TitleTestExample } from "@/lib/tool-test-title-examples";
import { truncateTitleTestSnippet } from "@/lib/tool-test-title-runs";

const MENU_WIDTH_PX = 380;
const MENU_MAX_HEIGHT_PX = 420;

type ComposerTestPromptsPickerProps = {
  disabled?: boolean;
  onSendPrompt: (text: string) => void;
};

/** Main chat: send user line only (no /tool-test assistant suffix or auto-stop). */
function resolveSendText(example: TitleTestExample): string {
  return example.userText.trim();
}

function resolvePreviewText(example: TitleTestExample): string {
  return example.userText.trim();
}

function IconTestPrompts() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M3.5 2.75h7a.75.75 0 0 1 .75.75v7.5a.75.75 0 0 1-.75.75h-7a.75.75 0 0 1-.75-.75v-7.5a.75.75 0 0 1 .75-.75Z"
        stroke="currentColor"
        strokeWidth="1.1"
      />
      <path
        d="M5 5.25h4M5 7.25h2.5M5 9.25h3.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ComposerTestPromptsPicker({
  disabled,
  onSendPrompt,
}: ComposerTestPromptsPickerProps) {
  const [open, setOpen] = useState(false);
  const [panelLayout, setPanelLayout] = useState<ReturnType<
    typeof computeFloatingMenuLayout
  > | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useMountedAriaControlsId();

  const updatePanelLayout = useCallback(() => {
    const button = triggerRef.current;
    if (!button) return;
    setPanelLayout(
      computeFloatingMenuLayout(
        button.getBoundingClientRect(),
        MENU_WIDTH_PX,
        MENU_MAX_HEIGHT_PX,
        "start",
      ),
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPanelLayout(null);
      return;
    }
    updatePanelLayout();
    window.addEventListener("resize", updatePanelLayout);
    window.addEventListener("scroll", updatePanelLayout, true);
    return () => {
      window.removeEventListener("resize", updatePanelLayout);
      window.removeEventListener("scroll", updatePanelLayout, true);
    };
  }, [open, updatePanelLayout]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const pick = (example: TitleTestExample) => {
    const text = resolveSendText(example).trim();
    if (!text) return;
    setOpen(false);
    onSendPrompt(text);
  };

  const panel =
    open && panelLayout ? (
      <div
        ref={panelRef}
        id={panelId}
        className="composer-popup composer-test-prompts-panel composer-test-prompts-panel--portal"
        role="dialog"
        aria-label="写动作样例 Prompt"
        style={{
          position: "fixed",
          top: panelLayout.top,
          left: panelLayout.left,
          width: MENU_WIDTH_PX,
          maxHeight: panelLayout.maxHeight,
          transform: panelLayout.transform,
          zIndex: 1200,
        }}
      >
        <div className="composer-test-prompts-panel__head">
          <span className="composer-test-prompts-panel__title">写动作样例</span>
          <span className="composer-test-prompts-panel__hint">
            稍复杂的编动作需求；点击即发送，走完整对话
          </span>
        </div>
        <div className="composer-test-prompts-panel__scroll">
          {COMPOSER_TEST_PROMPT_GROUPS.map((group) => (
            <section
              key={group.id}
              className="composer-test-prompts-group"
              aria-labelledby={`composer-test-prompts-${group.id}`}
            >
              <h3
                id={`composer-test-prompts-${group.id}`}
                className="composer-test-prompts-group__heading"
              >
                {group.label}
              </h3>
              <ul className="composer-test-prompts-list">
                {group.examples.map((example) => (
                  <li key={example.id}>
                    <button
                      type="button"
                      className="composer-test-prompts-item"
                      disabled={disabled}
                      onClick={() => pick(example)}
                    >
                      <span className="composer-test-prompts-item__label">
                        {example.label}
                      </span>
                      <span className="composer-test-prompts-item__desc">
                        {example.description}
                      </span>
                      <span className="composer-test-prompts-item__preview">
                        {truncateTitleTestSnippet(resolvePreviewText(example), 96)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="composer-test-prompts-panel__foot">
          <Link
            href="/tool-test"
            className="composer-test-prompts-panel__link"
            onClick={() => setOpen(false)}
          >
            打开 /tool-test 完整套件
          </Link>
        </div>
      </div>
    ) : null;

  return (
    <div className="composer-test-prompts" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`composer-test-prompts-trigger${open ? " composer-test-prompts-trigger--open" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        title="写动作样例（点击发送）"
        onClick={() => setOpen((v) => !v)}
      >
        <IconTestPrompts />
        <span>样例</span>
      </button>
      {typeof document !== "undefined" && panel
        ? createPortal(panel, document.body)
        : null}
    </div>
  );
}
