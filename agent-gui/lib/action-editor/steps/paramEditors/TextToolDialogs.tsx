"use client";

import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import { createPortal } from "react-dom";
import type { ActionMentionItem } from "@/lib/action-mention-items";
import { formatMentionItemMeta } from "@/lib/action-mention-items";
import type { ActionVariable } from "@/lib/action-editor/types/common";
import { useActionMentionSearch } from "@/lib/use-action-mention-search";
import { actionVariableRowKey } from "../../variables/actionVariableUi";
import {
  actionPickerModeForTool,
  buildActionPickerInsertValue,
  formatActionPickerShortId,
} from "./textToolActionPicker";
import {
  BOOL_EXPRESSION_SNIPPETS,
  buildBoolExpressionFromVariable,
  type TextToolDialogKind,
} from "./textToolWebSupport";
import { formatCapturedKey, keyCaptureModeForTool, type KeyCaptureMode } from "./textToolSendKeys";
import { MonacoExpressionEditor } from "../expression/MonacoExpressionEditor";

export type TextToolDialogState =
  | {
      kind: Exclude<TextToolDialogKind, "actionPicker">;
      toolId: string;
      initialValue?: string;
      variables?: ActionVariable[];
    }
  | {
      kind: "actionPicker";
      toolId: string;
    }
  | null;

type TextToolDialogsProps = {
  state: TextToolDialogState;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

function normalizeHexColor(raw: string, withAlpha: boolean): string {
  const text = raw.trim().replace(/^#/, "");
  if (!withAlpha && /^[0-9a-fA-F]{6}$/.test(text)) {
    return `#${text.toUpperCase()}`;
  }
  if (withAlpha && /^[0-9a-fA-F]{8}$/.test(text)) {
    return `#${text.toUpperCase()}`;
  }
  return withAlpha ? "#FF000000" : "#000000";
}

function hexToColorInputValue(hex: string): string {
  const text = hex.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(text)) {
    return `#${text}`;
  }
  if (/^[0-9a-fA-F]{8}$/.test(text)) {
    return `#${text.slice(2)}`;
  }
  return "#000000";
}

function ColorDialog({
  withAlpha,
  initialValue,
  onConfirm,
  onCancel,
}: {
  withAlpha: boolean;
  initialValue?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const [rgb, setRgb] = useState(() => hexToColorInputValue(initialValue ?? ""));
  const [alpha, setAlpha] = useState(() => {
    const text = (initialValue ?? "").trim().replace(/^#/, "");
    if (/^[0-9a-fA-F]{8}$/.test(text)) {
      return Number.parseInt(text.slice(0, 2), 16);
    }
    return 255;
  });

  const preview = useMemo(() => {
    const body = rgb.replace(/^#/, "").toUpperCase();
    if (!withAlpha) {
      return `#${body}`;
    }
    const a = Math.max(0, Math.min(255, alpha)).toString(16).padStart(2, "0").toUpperCase();
    return `#${a}${body}`;
  }, [alpha, rgb, withAlpha]);

  return (
    <div className="text-tool-dialog-panel">
      <h3 className="text-tool-dialog-title">{withAlpha ? "选择颜色 (#AARRGGBB)" : "选择颜色 (#RRGGBB)"}</h3>
      <div className="text-tool-dialog-row">
        <input
          type="color"
          className="text-tool-dialog-color-input"
          value={rgb}
          onChange={(event) => setRgb(event.target.value)}
        />
        <code className="text-tool-dialog-preview">{preview}</code>
      </div>
      {withAlpha ? (
        <label className="text-tool-dialog-field">
          <span>Alpha (0-255)</span>
          <input
            className="step-param-control"
            type="number"
            min={0}
            max={255}
            value={alpha}
            onChange={(event) => setAlpha(Number(event.target.value))}
          />
        </label>
      ) : null}
      <div className="text-tool-dialog-actions">
        <button type="button" className="step-editor-popup-btn secondary" onClick={onCancel}>
          取消
        </button>
        <button
          type="button"
          className="step-editor-popup-btn primary"
          onClick={() => onConfirm(normalizeHexColor(preview, withAlpha))}
        >
          确定
        </button>
      </div>
    </div>
  );
}

function PathPromptDialog({
  title,
  placeholder,
  initialValue,
  onConfirm,
  onCancel,
}: {
  title: string;
  placeholder: string;
  initialValue?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const [value, setValue] = useState(initialValue ?? "");
  return (
    <div className="text-tool-dialog-panel">
      <h3 className="text-tool-dialog-title">{title}</h3>
      <input
        className="step-param-control"
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        spellCheck={false}
      />
      <div className="text-tool-dialog-actions">
        <button type="button" className="step-editor-popup-btn secondary" onClick={onCancel}>
          取消
        </button>
        <button
          type="button"
          className="step-editor-popup-btn primary"
          disabled={!value.trim()}
          onClick={() => onConfirm(value.trim())}
        >
          确定
        </button>
      </div>
    </div>
  );
}

function KeyCaptureDialog({
  toolId,
  onConfirm,
  onCancel,
}: {
  toolId: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const mode = keyCaptureModeForTool(toolId) as KeyCaptureMode;
  const [preview, setPreview] = useState("");

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key === "Enter" && preview.trim()) {
        event.preventDefault();
        onConfirm(preview.trim());
        return;
      }
      const formatted = formatCapturedKey(event, mode);
      if (!formatted) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setPreview(formatted);
    },
    [mode, onCancel, onConfirm, preview],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);

  const hint =
    mode === "sendKeys"
      ? "按下快捷键后 Enter 确认（SendKeys 格式）"
      : mode === "keyCode"
        ? "按下按键后 Enter 确认（虚拟键码）"
        : "按下按键后 Enter 确认（键名）";

  return (
    <div className="text-tool-dialog-panel">
      <h3 className="text-tool-dialog-title">键盘输入</h3>
      <p className="text-tool-dialog-hint">{hint}，Esc 取消。</p>
      <div className="text-tool-dialog-key-preview">{preview || "等待按键…"}</div>
      <div className="text-tool-dialog-actions">
        <button type="button" className="step-editor-popup-btn secondary" onClick={onCancel}>
          取消
        </button>
        <button
          type="button"
          className="step-editor-popup-btn primary"
          disabled={!preview.trim()}
          onClick={() => onConfirm(preview.trim())}
        >
          确定
        </button>
      </div>
    </div>
  );
}

const ACTION_PICKER_SEARCH_LIMIT = 20;

function ActionPickerDialog({
  toolId,
  onConfirm,
  onCancel,
}: {
  toolId: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const insertMode = actionPickerModeForTool(toolId);
  const [keyword, setKeyword] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const search = useActionMentionSearch(keyword, { limit: ACTION_PICKER_SEARCH_LIMIT });

  const actions = useMemo(
    () => search.items.filter((item) => item.kind !== "subprogram"),
    [search.items],
  );

  const selectedItem = useMemo(
    () => actions.find((item) => item.id === selectedId) ?? null,
    [actions, selectedId],
  );

  const confirmItem = useCallback(
    (item: ActionMentionItem): void => {
      if (!insertMode) {
        return;
      }
      const value = buildActionPickerInsertValue(item, insertMode);
      if (!value) {
        window.alert("所选动作缺少可插入的 ID 或名称。");
        return;
      }
      onConfirm(value);
    },
    [insertMode, onConfirm],
  );

  const confirmSelection = useCallback((): void => {
    if (!selectedItem) {
      return;
    }
    confirmItem(selectedItem);
  }, [confirmItem, selectedItem]);

  const title = insertMode === "id" ? "选择动作 ID" : "选择动作名称";

  return (
    <div className="text-tool-dialog-panel text-tool-dialog-panel--wide text-tool-dialog-panel--action-picker">
      <h3 className="text-tool-dialog-title">{title}</h3>
      <p className="text-tool-dialog-hint">通过 qkrpc 搜索 Quicker 动作（需桌面版 Quicker 在线）。</p>
      <input
        className="step-param-control"
        value={keyword}
        placeholder="搜索动作名称或 GUID…"
        onChange={(event) => {
          setKeyword(event.target.value);
          setSelectedId(null);
        }}
        spellCheck={false}
        autoFocus
      />
      {search.isRefreshing && actions.length === 0 ? (
        <p className="text-tool-dialog-hint">正在加载动作列表…</p>
      ) : search.error ? (
        <p className="text-tool-dialog-hint text-tool-dialog-hint--error">{search.error}</p>
      ) : actions.length === 0 ? (
        <p className="text-tool-dialog-hint">
          {keyword.trim() ? "没有匹配的动作。" : "暂无最近使用的动作，请输入关键字搜索。"}
        </p>
      ) : (
        <div className="text-tool-action-picker-list" role="listbox" aria-label="动作列表">
          {actions.map((item) => {
            const selected = item.id === selectedId;
            const meta = formatMentionItemMeta(item);
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={selected}
                className={`text-tool-action-picker-row${selected ? " text-tool-action-picker-row--selected" : ""}`}
                onClick={() => setSelectedId(item.id)}
                onDoubleClick={() => confirmItem(item)}
              >
                <span className="text-tool-action-picker-title">{item.title}</span>
                <code className="text-tool-action-picker-id">{formatActionPickerShortId(item.id)}</code>
                {meta ? <span className="text-tool-action-picker-meta">{meta}</span> : null}
              </button>
            );
          })}
        </div>
      )}
      <div className="text-tool-dialog-actions">
        <button type="button" className="step-editor-popup-btn secondary" onClick={onCancel}>
          取消
        </button>
        <button
          type="button"
          className="step-editor-popup-btn primary"
          disabled={!selectedItem}
          onClick={confirmSelection}
        >
          确定
        </button>
      </div>
    </div>
  );
}

function BoolExpressionDialog({
  variables,
  onConfirm,
  onCancel,
}: {
  variables: ActionVariable[];
  onConfirm: (value: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const [expression, setExpression] = useState("true");
  const [replaceAll, setReplaceAll] = useState(true);

  const sortedVars = useMemo(
    () =>
      [...variables]
        .filter((item) => actionVariableRowKey(item).trim().length > 0)
        .sort((a, b) => actionVariableRowKey(a).localeCompare(actionVariableRowKey(b), "zh-CN")),
    [variables],
  );

  const commit = (): void => {
    const trimmed = expression.trim();
    if (!trimmed) {
      return;
    }
    const value = replaceAll && !trimmed.startsWith("$=") ? `$= ${trimmed}` : trimmed;
    onConfirm(value);
  };

  return (
    <div className="text-tool-dialog-panel text-tool-dialog-panel--wide">
      <h3 className="text-tool-dialog-title">布尔表达式助手</h3>
      <div className="text-tool-dialog-snippet-row">
        {BOOL_EXPRESSION_SNIPPETS.map((item) => (
          <button
            key={item.label}
            type="button"
            className="text-tool-dialog-snippet-btn"
            onClick={() => setExpression(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {sortedVars.length > 0 ? (
        <div className="text-tool-dialog-var-row">
          {sortedVars.map((item) => (
            <button
              key={actionVariableRowKey(item)}
              type="button"
              className="text-tool-dialog-var-btn"
              onClick={() => setExpression(buildBoolExpressionFromVariable(item))}
            >
              {actionVariableRowKey(item)}
            </button>
          ))}
        </div>
      ) : null}
      <textarea
        className="step-param-control step-param-control--multiline text-tool-dialog-expression"
        rows={4}
        value={expression}
        onChange={(event) => setExpression(event.target.value)}
        spellCheck={false}
      />
      <label className="form-spec-inline-check">
        <input
          type="checkbox"
          checked={replaceAll}
          onChange={(event) => setReplaceAll(event.target.checked)}
        />
        <span>替换全部内容（自动加 $= 前缀）</span>
      </label>
      <div className="text-tool-dialog-actions">
        <button type="button" className="step-editor-popup-btn secondary" onClick={onCancel}>
          取消
        </button>
        <button type="button" className="step-editor-popup-btn primary" onClick={commit}>
          确定
        </button>
      </div>
    </div>
  );
}

function EditInCodeDialog({
  initialValue,
  onConfirm,
  onCancel,
}: {
  initialValue?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const [text, setText] = useState(initialValue ?? "");

  const commit = useCallback((): void => {
    onConfirm(text);
  }, [onConfirm, text]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        commit();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [commit]);

  return (
    <div className="text-tool-dialog-panel text-tool-dialog-panel--code">
      <h3 className="text-tool-dialog-title">在编辑器中修改</h3>
      <p className="text-tool-dialog-hint">Esc 关闭 · Ctrl+Enter 确定</p>
      <MonacoExpressionEditor
        className="text-tool-dialog-code-editor"
        value={text}
        onChange={setText}
        multiline
        maxMultilineHeight={480}
      />
      <div className="text-tool-dialog-actions">
        <button type="button" className="step-editor-popup-btn secondary" onClick={onCancel}>
          取消
        </button>
        <button type="button" className="step-editor-popup-btn primary" onClick={commit}>
          确定
        </button>
      </div>
    </div>
  );
}

export function TextToolDialogs({ state, onConfirm, onCancel }: TextToolDialogsProps): JSX.Element | null {
  useEffect(() => {
    if (!state) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [state, onCancel]);

  if (!state) {
    return null;
  }

  const body =
    state.kind === "color" ? (
      <ColorDialog
        withAlpha={false}
        initialValue={state.initialValue}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    ) : state.kind === "colorArgb" ? (
      <ColorDialog
        withAlpha
        initialValue={state.initialValue}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    ) : state.kind === "savePath" ? (
      <PathPromptDialog
        title="输入保存路径"
        placeholder="例如 C:\\Users\\me\\output.txt"
        initialValue={state.initialValue}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    ) : state.kind === "keyCapture" ? (
      <KeyCaptureDialog toolId={state.toolId} onConfirm={onConfirm} onCancel={onCancel} />
    ) : state.kind === "actionPicker" ? (
      <ActionPickerDialog toolId={state.toolId} onConfirm={onConfirm} onCancel={onCancel} />
    ) : state.kind === "editInCode" ? (
      <EditInCodeDialog
        initialValue={state.initialValue}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    ) : (
      <BoolExpressionDialog
        variables={state.variables ?? []}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

  const dialogClassName =
    state.kind === "editInCode" ? "text-tool-dialog text-tool-dialog--code" : "text-tool-dialog";

  return createPortal(
    <div
      className="text-tool-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        className={dialogClassName}
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {body}
      </div>
    </div>,
    document.body,
  );
}
