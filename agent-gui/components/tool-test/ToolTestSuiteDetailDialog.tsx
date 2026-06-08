"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { getToolMeta } from "@/lib/tool-registry";
import type { ToolTestStep, ToolTestSuite } from "@/lib/tool-test-suites";
import {
  defaultStepInputJson,
  formatToolTestInputCompact,
} from "@/lib/tool-test-input-format";

type StepInputOverrides = Record<string, string>;

function parseStepInputJson(
  raw: string,
  fallback: Record<string, unknown>,
): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const parsed = JSON.parse(trimmed) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Input must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function resolveStepInputRaw(
  overrideKey: string,
  step: ToolTestStep,
  stepOverrides: StepInputOverrides,
): string {
  return stepOverrides[overrideKey] ?? defaultStepInputJson(step.input);
}

function ToolTestStepRow({
  suiteId,
  step,
  sharedToolName,
  stepOverrides,
  onOverrideChange,
  disabled,
}: {
  suiteId: string;
  step: ToolTestStep;
  sharedToolName: string | null;
  stepOverrides: StepInputOverrides;
  onOverrideChange: (key: string, json: string) => void;
  disabled: boolean;
}) {
  const meta = getToolMeta(step.toolName);
  const overrideKey = `${suiteId}:${step.id}`;
  const raw = resolveStepInputRaw(overrideKey, step, stepOverrides);
  let compact = formatToolTestInputCompact(step.input);
  try {
    compact = formatToolTestInputCompact(parseStepInputJson(raw, step.input));
  } catch {
    /* keep preset compact label */
  }
  const showTool = sharedToolName === null;
  const showBadge = showTool && meta?.group;

  return (
    <li className="tool-test-step">
      <div className="tool-test-step__row">
        <code className="tool-test-step__name" title={step.toolName}>
          {step.toolName}
        </code>
        <code className="tool-test-step__params" title={raw}>
          {compact}
        </code>
        {showTool ? (
          <code className="tool-test-step__tool">{step.toolName}</code>
        ) : null}
        {showBadge ? (
          <span
            className={`tool-test-step__badge tool-test-step__badge--${meta!.group}`}
          >
            {meta!.group}
          </span>
        ) : null}
      </div>
      <textarea
        className="tool-test-step__input"
        rows={Math.min(6, Math.max(2, raw.split("\n").length))}
        value={raw}
        spellCheck={false}
        disabled={disabled}
        onChange={(e) => onOverrideChange(overrideKey, e.target.value)}
        aria-label={`${step.label} 参数 JSON`}
      />
    </li>
  );
}

export type ToolTestSuiteDetailDialogProps = {
  open: boolean;
  suite: ToolTestSuite | null;
  stepOverrides: StepInputOverrides;
  onOverrideChange: (key: string, json: string) => void;
  disabled: boolean;
  onClose: () => void;
};

export function ToolTestSuiteDetailDialog({
  open,
  suite,
  stepOverrides,
  onOverrideChange,
  disabled,
  onClose,
}: ToolTestSuiteDetailDialogProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !disabled) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [disabled, onClose, open]);

  if (!open || !suite || typeof document === "undefined") {
    return null;
  }

  const firstTool = suite.steps[0]?.toolName;
  const sharedToolName =
    firstTool && suite.steps.every((s) => s.toolName === firstTool)
      ? firstTool
      : null;
  const sharedMeta = sharedToolName ? getToolMeta(sharedToolName) : null;

  return createPortal(
    <div
      className="tool-test-suite-detail-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !disabled) {
          onClose();
        }
      }}
    >
      <div
        className="tool-test-suite-detail-dialog composer-popup"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="tool-test-suite-detail-dialog__head">
          <h2 id={titleId} className="tool-test-suite-detail-dialog__title">
            <code className="tool-test-suite-detail-dialog__tool-id">{suite.title}</code>
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="tool-test-suite-detail-dialog__close"
            disabled={disabled}
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </header>
        <p className="tool-test-suite-detail-dialog__desc">{suite.description}</p>
        {sharedToolName ? (
          <div className="tool-test-suite-card__toolline">
            <code className="tool-test-step__tool">{sharedToolName}</code>
            {sharedMeta?.group ? (
              <span
                className={`tool-test-step__badge tool-test-step__badge--${sharedMeta.group}`}
              >
                {sharedMeta.group}
              </span>
            ) : null}
            <span className="tool-test-suite-card__count">
              {suite.steps.length} 步
            </span>
          </div>
        ) : null}
        <ol className="tool-test-suite-card__steps tool-test-suite-detail-dialog__steps">
          {suite.steps.map((step) => (
            <ToolTestStepRow
              key={step.id}
              suiteId={suite.id}
              step={step}
              sharedToolName={sharedToolName}
              stepOverrides={stepOverrides}
              onOverrideChange={onOverrideChange}
              disabled={disabled}
            />
          ))}
        </ol>
        <footer className="tool-test-suite-detail-dialog__foot">
          <button
            type="button"
            className="tool-test-suite-detail-dialog__done"
            disabled={disabled}
            onClick={onClose}
          >
            完成
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
