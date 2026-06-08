"use client";

import { useCallback, useState } from "react";
import { startActionTrace } from "@/lib/action-trace-client";
import {
  ACTION_TRACE_SETUP_CASES,
  ACTION_TRACE_STANDALONE_CASES,
  getDefaultActionTraceTestCase,
} from "@/lib/action-trace-test-cases";
import { pushAppMessage } from "@/lib/app-messages";

type ToolTestActionTracePanelProps = {
  disabled?: boolean;
};

export function ToolTestActionTracePanel({
  disabled = false,
}: ToolTestActionTracePanelProps) {
  const [customId, setCustomId] = useState(
    () => getDefaultActionTraceTestCase().actionId,
  );
  const [customParam, setCustomParam] = useState("");
  const [busy, setBusy] = useState(false);

  const runTrace = useCallback(
    (options: {
      actionId: string;
      param?: string;
      actionTitle?: string;
      xaction?: (typeof ACTION_TRACE_STANDALONE_CASES)[number]["xaction"];
      label: string;
    }) => {
      if (disabled || busy) return;
      setBusy(true);
      const result = startActionTrace({
        actionId: options.actionId,
        param: options.param,
        actionTitle: options.actionTitle,
        xaction: options.xaction,
      });
      setBusy(false);
      if (!result.ok) {
        pushAppMessage({
          id: "tool-test-trace",
          kind: "error",
          body: result.error ?? "trace 启动失败",
          autoDismissMs: 6000,
        });
        return;
      }
      pushAppMessage({
        id: "tool-test-trace",
        kind: "success",
        body: `已启动 trace：${options.label}（见右侧输出区）`,
        autoDismissMs: 4000,
      });
    },
    [busy, disabled],
  );

  const runPreset = useCallback(
    (testCase: (typeof ACTION_TRACE_STANDALONE_CASES)[number]) => {
      runTrace({
        actionId: testCase.actionId,
        param: testCase.param,
        actionTitle: testCase.actionTitle,
        xaction: testCase.xaction,
        label: testCase.label,
      });
    },
    [runTrace],
  );

  const runCustom = useCallback(() => {
    const actionId = customId.trim();
    if (!actionId) {
      pushAppMessage({
        id: "tool-test-trace",
        kind: "warning",
        body: "请填写动作 ID",
        autoDismissMs: 4000,
      });
      return;
    }
    runTrace({
      actionId,
      param: customParam.trim() || undefined,
      label: actionId,
    });
  }, [customId, customParam, runTrace]);

  return (
    <div className="tool-test-action-trace-panel">
      <p className="tool-test-action-trace-panel__hint">
        点击预设即可 trace（内联 JSON，无需在 Quicker 创建动作）。输出在右侧主区域；需 Quicker + qkrpc serve。
      </p>

      <section className="tool-test-action-trace-group">
        <h3 className="tool-test-action-trace-group__title">一键运行</h3>
        <p className="tool-test-action-trace-group__lead tool-muted">
          无运行参数、不依赖剪贴板或外部文件
        </p>
        <div className="tool-test-action-trace-group__list">
          {ACTION_TRACE_STANDALONE_CASES.map((testCase) => (
            <button
              key={testCase.id}
              type="button"
              className="tool-test-action-trace-case tool-test-action-trace-case--standalone"
              disabled={disabled || busy}
              title={testCase.description}
              onClick={() => runPreset(testCase)}
            >
              <span className="tool-test-action-trace-case__label">
                {testCase.label}
              </span>
              <span className="tool-test-action-trace-case__meta">
                {testCase.actionTitle ?? testCase.actionId}
              </span>
            </button>
          ))}
        </div>
      </section>

      {ACTION_TRACE_SETUP_CASES.length > 0 ? (
        <section className="tool-test-action-trace-group">
          <h3 className="tool-test-action-trace-group__title">需额外条件</h3>
          <p className="tool-test-action-trace-group__lead tool-muted">
            运行前需准备文件 path、参数等
          </p>
          <div className="tool-test-action-trace-group__list">
            {ACTION_TRACE_SETUP_CASES.map((testCase) => (
              <button
                key={testCase.id}
                type="button"
                className="tool-test-action-trace-case"
                disabled={disabled || busy}
                title={testCase.description}
                onClick={() =>
                  runTrace({
                    actionId: testCase.actionId,
                    param: testCase.param,
                    actionTitle: testCase.actionTitle,
                    xaction: testCase.xaction,
                    label: testCase.label,
                  })
                }
              >
                <span className="tool-test-action-trace-case__label">
                  {testCase.label}
                </span>
                <span className="tool-test-action-trace-case__meta">
                  {testCase.actionTitle ?? testCase.actionId}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="tool-test-action-trace-custom">
        <h3 className="tool-test-action-trace-group__title">自定义</h3>
        <label className="tool-test-action-trace-field">
          <span className="tool-test-action-trace-field__label">动作 ID</span>
          <input
            type="text"
            className="tool-test-action-trace-field__input"
            value={customId}
            disabled={disabled || busy}
            placeholder="GUID 或动作名"
            onChange={(e) => setCustomId(e.target.value)}
          />
        </label>
        <label className="tool-test-action-trace-field">
          <span className="tool-test-action-trace-field__label">运行参数</span>
          <input
            type="text"
            className="tool-test-action-trace-field__input"
            value={customParam}
            disabled={disabled || busy}
            placeholder="可选"
            onChange={(e) => setCustomParam(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="tool-test-action-trace-panel__run"
          disabled={disabled || busy || !customId.trim()}
          onClick={runCustom}
        >
          {busy ? "启动中…" : "启动 Trace"}
        </button>
      </section>
    </div>
  );
}
