"use client";

import { useCallback, useMemo, useState } from "react";
import type { ActionMentionItem } from "@/lib/action-mention-items";
import {
  ACTION_RUNTIME_PRESET_CASES,
  getDefaultActionRuntimeTestCase,
  type ActionRuntimeTestCase,
} from "@/lib/action-runtime-test-cases";
import {
  invokeActionRuntimeDev,
  type ActionRuntimeInvokeOp,
} from "@/lib/action-runtime-client";
import {
  createActionRuntimeRunId,
  type ActionRuntimeRunEntry,
} from "@/lib/action-runtime-test-runs";
import { pushAppMessage } from "@/lib/app-messages";
import { ToolTestActionRuntimeActionPicker } from "@/components/tool-test/ToolTestActionRuntimeActionPicker";
import { ToolTestActionRuntimeMockPanel } from "@/components/tool-test/ToolTestActionRuntimeMockPanel";

type ToolTestActionRuntimePanelProps = {
  disabled?: boolean;
  workingDirectory?: string;
  onAppendRun: (entry: ActionRuntimeRunEntry) => void;
  onPatchRun: (id: string, patch: Partial<ActionRuntimeRunEntry>) => void;
};

const OP_LABELS: Record<ActionRuntimeInvokeOp, string> = {
  run: "运行",
  check: "支持检查",
  keys: "模块列表",
  validate: "工程校验",
  mockRun: "Mock 断言",
  mockProfilesList: "Mock profiles",
};

export function ToolTestActionRuntimePanel({
  disabled,
  workingDirectory,
  onAppendRun,
  onPatchRun,
}: ToolTestActionRuntimePanelProps) {
  const [projectDir, setProjectDir] = useState("");
  const [customJson, setCustomJson] = useState(() =>
    JSON.stringify(getDefaultActionRuntimeTestCase().program, null, 2),
  );
  const [param, setParam] = useState("");
  const [verboseHost, setVerboseHost] = useState(false);
  const [busy, setBusy] = useState(false);

  const presetGroups = useMemo(() => {
    const order = ["基础", "流程", "数据", "子程序", "预览"] as const;
    const map = new Map<string, ActionRuntimeTestCase[]>();
    for (const testCase of ACTION_RUNTIME_PRESET_CASES) {
      const list = map.get(testCase.tag) ?? [];
      list.push(testCase);
      map.set(testCase.tag, list);
    }
    return order
      .filter((tag) => map.has(tag))
      .map((tag) => ({ tag, cases: map.get(tag)! }));
  }, []);

  const invoke = useCallback(
    async (
      op: ActionRuntimeInvokeOp,
      label: string,
      args: Record<string, unknown>,
    ) => {
      if (disabled || busy) return;
      setBusy(true);
      const entry: ActionRuntimeRunEntry = {
        id: createActionRuntimeRunId(),
        at: Date.now(),
        label: `${OP_LABELS[op]}：${label}`,
        op,
        status: "running",
        requestArgs: args,
      };
      onAppendRun(entry);
      try {
        const result = await invokeActionRuntimeDev(op, args);
        onPatchRun(entry.id, {
          status: result.ok ? "done" : "error",
          result,
          error: result.ok ? undefined : result.message ?? result.error,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "请求失败";
        onPatchRun(entry.id, { status: "error", error: message });
      } finally {
        setBusy(false);
      }
    },
    [busy, disabled, onAppendRun, onPatchRun],
  );

  const runPreset = useCallback(
    (testCase: ActionRuntimeTestCase, op: ActionRuntimeInvokeOp) => {
      void invoke(op, testCase.label, {
        xaction: testCase.program,
        param: param.trim() || undefined,
        verboseHost,
      });
    },
    [invoke, param, verboseHost],
  );

  const runCustom = useCallback(
    (op: ActionRuntimeInvokeOp) => {
      let program: unknown;
      try {
        program = JSON.parse(customJson) as unknown;
      } catch {
        pushAppMessage({
          id: "tool-test-runtime",
          kind: "warning",
          body: "自定义 JSON 无法解析",
          autoDismissMs: 4000,
        });
        return;
      }
      void invoke(op, "自定义 JSON", {
        xaction: program,
        param: param.trim() || undefined,
        verboseHost,
      });
    },
    [customJson, invoke, param, verboseHost],
  );

  const runQuickerAction = useCallback(
    (item: ActionMentionItem, op: ActionRuntimeInvokeOp) => {
      void invoke(op, item.title, {
        id: item.id,
        param: param.trim() || undefined,
        verboseHost,
      });
    },
    [invoke, param, verboseHost],
  );

  const runProject = useCallback(
    (op: ActionRuntimeInvokeOp) => {
      const dir = projectDir.trim();
      if (!dir) {
        pushAppMessage({
          id: "tool-test-runtime",
          kind: "warning",
          body: "请填写 .quicker 工程目录（相对工作区）",
          autoDismissMs: 4000,
        });
        return;
      }
      void invoke(op, dir, {
        dir,
        param: param.trim() || undefined,
        verboseHost,
      });
    },
    [invoke, param, projectDir, verboseHost],
  );

  return (
    <div className="tool-test-runtime-panel">
      <p className="tool-test-runtime-panel__hint">
        下方<strong>示例用例</strong>覆盖 wire、分支、子程序与 C# 预览；右侧可看 JSON→C#。按动作 ID
        运行从 Quicker 直读程序体。
        {workingDirectory ? (
          <>
            {" "}
            工作区：
            <code className="tool-test-runtime-panel__cwd">{workingDirectory}</code>
          </>
        ) : null}
      </p>

      <section className="tool-test-runtime-group tool-test-runtime-group--presets">
        <h3 className="tool-test-runtime-group__title">示例用例</h3>
        {presetGroups.map((group) => (
          <div key={group.tag} className="tool-test-runtime-preset-group">
            <h4 className="tool-test-runtime-preset-group__tag">{group.tag}</h4>
            <div className="tool-test-runtime-group__list">
              {group.cases.map((testCase) => (
                <div key={testCase.id} className="tool-test-runtime-case">
                  <div className="tool-test-runtime-case__text">
                    <span className="tool-test-runtime-case__label">{testCase.label}</span>
                    <span className="tool-test-runtime-case__meta">{testCase.description}</span>
                  </div>
                  <div className="tool-test-runtime-case__actions">
                    <button
                      type="button"
                      className="tool-test-runtime-btn tool-test-runtime-btn--primary"
                      disabled={disabled || busy}
                      onClick={() => runPreset(testCase, "run")}
                    >
                      运行
                    </button>
                    <button
                      type="button"
                      className="tool-test-runtime-btn"
                      disabled={disabled || busy}
                      onClick={() => runPreset(testCase, "check")}
                    >
                      检查
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <ToolTestActionRuntimeActionPicker
        disabled={disabled}
        busy={busy}
        onRun={runQuickerAction}
      />

      <ToolTestActionRuntimeMockPanel
        disabled={disabled}
        onAppendRun={onAppendRun}
        onPatchRun={onPatchRun}
      />

      <section className="tool-test-runtime-group">
        <h3 className="tool-test-runtime-group__title">自定义 program JSON</h3>
        <textarea
          className="tool-test-runtime-json"
          value={customJson}
          disabled={disabled || busy}
          rows={8}
          spellCheck={false}
          onChange={(e) => setCustomJson(e.target.value)}
        />
        <div className="tool-test-runtime-row">
          <button
            type="button"
            className="tool-test-runtime-btn tool-test-runtime-btn--primary"
            disabled={disabled || busy}
            onClick={() => runCustom("run")}
          >
            运行 JSON
          </button>
          <button
            type="button"
            className="tool-test-runtime-btn"
            disabled={disabled || busy}
            onClick={() => runCustom("check")}
          >
            检查 JSON
          </button>
        </div>
      </section>

      <section className="tool-test-runtime-group">
        <h3 className="tool-test-runtime-group__title">本地工程目录</h3>
        <label className="tool-test-runtime-field">
          <span className="tool-test-runtime-field__label">dir（相对工作区）</span>
          <input
            className="tool-test-runtime-field__input"
            value={projectDir}
            disabled={disabled || busy}
            placeholder=".quicker/actions/<id> 或 QuickerRpc.Console.Test/Fixtures/..."
            onChange={(e) => setProjectDir(e.target.value)}
          />
        </label>
        <div className="tool-test-runtime-row">
          <button
            type="button"
            className="tool-test-runtime-btn tool-test-runtime-btn--primary"
            disabled={disabled || busy}
            onClick={() => runProject("run")}
          >
            编译并运行
          </button>
          <button
            type="button"
            className="tool-test-runtime-btn"
            disabled={disabled || busy}
            onClick={() => runProject("check")}
          >
            编译并检查
          </button>
          <button
            type="button"
            className="tool-test-runtime-btn"
            disabled={disabled || busy}
            onClick={() => runProject("validate")}
          >
            校验 file 引用
          </button>
        </div>
      </section>

      <section className="tool-test-runtime-group">
        <h3 className="tool-test-runtime-group__title">通用</h3>
        <label className="tool-test-runtime-field">
          <span className="tool-test-runtime-field__label">输入参数 param</span>
          <input
            className="tool-test-runtime-field__input"
            value={param}
            disabled={disabled || busy}
            onChange={(e) => setParam(e.target.value)}
          />
        </label>
        <label className="tool-test-runtime-check">
          <input
            type="checkbox"
            checked={verboseHost}
            disabled={disabled || busy}
            onChange={(e) => setVerboseHost(e.target.checked)}
          />
          verbose-host（输出 IHostServices 回调）
        </label>
        <button
          type="button"
          className="tool-test-runtime-btn"
          disabled={disabled || busy}
          onClick={() => void invoke("keys", "supported keys", {})}
        >
          列出已支持 stepRunnerKey
        </button>
      </section>
    </div>
  );
}
