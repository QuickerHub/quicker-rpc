"use client";

import { Fragment, useEffect, useMemo, type JSX, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ACTION_DESIGNER_HELP_SECTIONS,
  type ActionDesignerHelpSection,
} from "@/lib/action-editor/shared/actionDesignerHelpContent";

export type ActionDesignerHelpDialogProps = {
  onClose: () => void;
};

type HelpLineGap = { type: "gap" };
type HelpLineText = { type: "text"; text: string };
type HelpLineShortcut = { type: "shortcut"; combo: string; description: string };
type ParsedHelpLine = HelpLineGap | HelpLineText | HelpLineShortcut;

type SectionTone = "editor" | "steps" | "runtime";

const SECTION_META: Record<string, { icon: string; tone: SectionTone }> = {
  编辑器: { icon: "◫", tone: "editor" },
  步骤列表: { icon: "☰", tone: "steps" },
  "步骤弹窗 · 变量 · 运行": { icon: "⚡", tone: "runtime" },
};

const INTRO_LABELS = new Set([
  "可视化",
  "源码 JSON",
  "双击步骤",
  "步骤编辑弹窗",
  "变量侧栏",
  "顶部工具栏",
  "桌面版",
]);

function splitComboAlternatives(combo: string): string[] {
  return combo
    .split(/\s*(?:\/|或)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isSingleShortcutCombo(combo: string): boolean {
  if (combo.includes("+")) {
    return true;
  }

  return /^(?:F\d+|[↑↓←→]+|Delete|Backspace|Enter|Esc|\/|A|B|H)$/.test(combo);
}

function isShortcutCombo(combo: string): boolean {
  if (INTRO_LABELS.has(combo)) {
    return false;
  }

  const alternatives = splitComboAlternatives(combo);
  if (alternatives.length > 1) {
    return alternatives.every((part) => isSingleShortcutCombo(part));
  }

  return isSingleShortcutCombo(combo);
}

function parseHelpLine(line: string): ParsedHelpLine {
  const trimmed = line.trim();
  if (!trimmed) {
    return { type: "gap" };
  }

  const colonMatch = trimmed.match(/^([^：:]+)[：:]\s*(.+)$/);
  if (!colonMatch) {
    return { type: "text", text: trimmed };
  }

  const combo = colonMatch[1]!.trim();
  const description = colonMatch[2]!.replace(/[；;]\s*$/, "").trim();
  if (isShortcutCombo(combo)) {
    return { type: "shortcut", combo, description };
  }

  return { type: "text", text: trimmed };
}

type HelpBlock =
  | { type: "gap" }
  | { type: "text"; text: string }
  | { type: "shortcut-list"; rows: Array<{ combo: string; description: string }> };

function buildHelpBlocks(section: ActionDesignerHelpSection): HelpBlock[] {
  const blocks: HelpBlock[] = [];
  let shortcutRows: Array<{ combo: string; description: string }> = [];

  const flushShortcuts = (): void => {
    if (shortcutRows.length === 0) {
      return;
    }
    blocks.push({ type: "shortcut-list", rows: shortcutRows });
    shortcutRows = [];
  };

  for (const line of section.lines) {
    const parsed = parseHelpLine(line);
    if (parsed.type === "gap") {
      flushShortcuts();
      blocks.push({ type: "gap" });
      continue;
    }
    if (parsed.type === "shortcut") {
      shortcutRows.push({ combo: parsed.combo, description: parsed.description });
      continue;
    }
    flushShortcuts();
    blocks.push({ type: "text", text: parsed.text });
  }

  flushShortcuts();
  return blocks;
}

function ShortcutKeys({ combo }: { combo: string }): JSX.Element {
  const alternatives = splitComboAlternatives(combo);
  return (
    <span className="action-designer-help-keys">
      {alternatives.map((alternative, altIndex) => (
        <Fragment key={alternative}>
          {altIndex > 0 ? <span className="action-designer-help-keys-or">/</span> : null}
          <span className="action-designer-help-key-group">
            {alternative.split("+").map((token, tokenIndex) => {
              const key = token.trim();
              if (!key) {
                return null;
              }
              return (
                <Fragment key={`${alternative}-${key}-${tokenIndex}`}>
                  {tokenIndex > 0 ? <span className="action-designer-help-key-plus">+</span> : null}
                  <kbd className="action-designer-help-kbd">{key}</kbd>
                </Fragment>
              );
            })}
          </span>
        </Fragment>
      ))}
    </span>
  );
}

function HelpText({ text }: { text: string }): JSX.Element {
  const labeled = text.match(/^([^：:]+)[：:]\s*(.+)$/);
  if (labeled) {
    return (
      <p className="action-designer-help-line action-designer-help-line--labeled">
        <span className="action-designer-help-line-label">{labeled[1]}</span>
        <span className="action-designer-help-line-desc">{labeled[2]}</span>
      </p>
    );
  }

  return <p className="action-designer-help-line">{text}</p>;
}

function renderHelpSection(section: ActionDesignerHelpSection): JSX.Element {
  const meta = SECTION_META[section.title] ?? { icon: "•", tone: "editor" as const };
  const blocks = buildHelpBlocks(section);

  return (
    <section
      key={section.title}
      className={`action-designer-help-section action-designer-help-section--${meta.tone}`}
    >
      <header className="action-designer-help-section-head">
        <span className="action-designer-help-section-icon" aria-hidden>
          {meta.icon}
        </span>
        <h3 className="action-designer-help-section-title">{section.title}</h3>
      </header>
      <div className="action-designer-help-section-body">
        {blocks.map((block, index) => {
          if (block.type === "gap") {
            return <div key={`gap-${index}`} className="action-designer-help-gap" aria-hidden />;
          }
          if (block.type === "text") {
            return <HelpText key={`text-${index}`} text={block.text} />;
          }
          return (
            <ul key={`shortcuts-${index}`} className="action-designer-help-shortcuts" aria-label={`${section.title}快捷键`}>
              {block.rows.map((row) => (
                <li key={`${row.combo}-${row.description}`} className="action-designer-help-shortcut-row">
                  <div className="action-designer-help-shortcut-keys">
                    <ShortcutKeys combo={row.combo} />
                  </div>
                  <p className="action-designer-help-shortcut-desc">{row.description}</p>
                </li>
              ))}
            </ul>
          );
        })}
      </div>
    </section>
  );
}

export function ActionDesignerHelpDialog({ onClose }: ActionDesignerHelpDialogProps): JSX.Element {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const sections = useMemo(
    () => ACTION_DESIGNER_HELP_SECTIONS.map((section) => renderHelpSection(section)),
    [],
  );

  const dialog: ReactNode = (
    <div
      className="shortcut-popup-backdrop action-designer-help-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="shortcut-popup action-designer-help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-designer-help-title"
        aria-describedby="action-designer-help-lead"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="shortcut-popup-header action-designer-help-header">
          <div className="action-designer-help-header-main">
            <span className="action-designer-help-header-badge" aria-hidden>
              F1
            </span>
            <div className="action-designer-help-header-text">
              <h2 id="action-designer-help-title">动作编辑器说明</h2>
              <p className="action-designer-help-header-sub">快捷键与 Web 编辑器操作指南</p>
            </div>
          </div>
          <button type="button" className="shortcut-popup-close" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="shortcut-popup-body action-designer-help-body">
          <p id="action-designer-help-lead" className="action-designer-help-lead">
            交互习惯对齐 Quicker 桌面动作设计器；下方按功能分区列出常用操作与快捷键。
          </p>
          <div className="action-designer-help-columns">{sections}</div>
        </div>
        <footer className="shortcut-popup-footer action-designer-help-footer">
          <span className="action-designer-help-footer-hint">
            <kbd className="action-designer-help-kbd action-designer-help-kbd--hint">Esc</kbd>
            关闭窗口
          </span>
          <button type="button" className="shortcut-popup-btn" onClick={onClose}>
            关闭
          </button>
        </footer>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
