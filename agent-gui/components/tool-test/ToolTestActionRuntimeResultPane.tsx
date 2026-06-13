"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ActionRuntimeCompiledFile,
  ActionRuntimeRunEntry,
} from "@/lib/action-runtime-test-runs";
import { formatActionRuntimeInputJson } from "@/lib/action-runtime-wire-json";
import { resolveGeneratedProgramCs } from "@/lib/action-runtime-program-cs-preview";
import { ToolTestRunsPaneShell } from "@/components/tool-test/ToolTestRunsPaneShell";

type ToolTestActionRuntimeResultPaneProps = {
  runs: ActionRuntimeRunEntry[];
  workingDirectory?: string;
  onClearRuns: () => void;
};

type RuntimeViewTab = "result" | "input" | "csharp" | "files" | "response";

const VIEW_TABS: { id: RuntimeViewTab; label: string }[] = [
  { id: "result", label: "结果" },
  { id: "input", label: "输入 JSON" },
  { id: "csharp", label: "C# 预览" },
  { id: "files", label: "file 内联" },
  { id: "response", label: "完整响应" },
];

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatJsonText(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  if (value !== undefined && value !== null) {
    return formatJson(value);
  }

  return undefined;
}

function resolveInputJson(
  run: ActionRuntimeRunEntry,
  data: Record<string, unknown>,
): string | undefined {
  const fromResponse = formatJsonText(data.sourceProgramJson);
  if (fromResponse) return fromResponse;

  const args = run.requestArgs;
  if (!args) return undefined;

  if (args.xaction !== undefined) {
    return formatActionRuntimeInputJson(args.xaction) ?? formatJsonText(args.xaction);
  }

  if (args.program !== undefined) {
    return formatActionRuntimeInputJson(args.program) ?? formatJsonText(args.program);
  }

  if (args.dir || args.id) {
    return formatJson({
      dir: args.dir,
      id: args.id,
      param: args.param,
    });
  }

  return formatJson(args);
}

function shortRunLabel(label: string): string {
  return label.replace(/^(运行|支持检查|模块列表|工程校验|Mock 断言|Mock profiles)：/, "");
}

function statusLabel(status: ActionRuntimeRunEntry["status"]): string {
  if (status === "running") return "运行中";
  if (status === "done") return "成功";
  return "失败";
}

function CodePane({
  text,
  className,
  emptyText,
}: {
  text?: string;
  className?: string;
  emptyText?: string;
}) {
  if (!text?.trim()) {
    return (
      <div className="tool-test-runtime-code-pane tool-test-runtime-code-pane--empty">
        <p className="tool-muted">{emptyText ?? "无内容"}</p>
      </div>
    );
  }

  return (
    <div className="tool-test-runtime-code-pane">
      <pre
        className={["tool-test-runtime-code-pane__pre", className ?? ""]
          .filter(Boolean)
          .join(" ")}
      >
        {text}
      </pre>
    </div>
  );
}

function RunDetailView({
  run,
  viewTab,
}: {
  run: ActionRuntimeRunEntry;
  viewTab: RuntimeViewTab;
}) {
  const data = run.result?.data as Record<string, unknown> | undefined;
  const supported = data?.supportedStepKeys as string[] | undefined;
  const unsupported = data?.unsupportedStepKeys as string[] | undefined;
  const keys = data?.keys as string[] | undefined;
  const outputVars = data?.outputVars as Record<string, unknown> | undefined;
  const assertions = data?.assertions as
    | { passed?: boolean; results?: unknown[] }
    | undefined;
  const fixHints = data?.fixHints as string[] | undefined;
  const mockLedger = data?.mockLedger as Record<string, unknown> | undefined;
  const events = data?.events as unknown[] | undefined;
  const eventCount = data?.eventCount as number | undefined;
  const compiledFiles = (data?.compiledFiles as ActionRuntimeCompiledFile[] | undefined) ?? [];
  const inputJson = data ? resolveInputJson(run, data) : resolveInputJson(run, {});
  const generatedCs = resolveGeneratedProgramCs(data, run.requestArgs);

  if (viewTab === "input") {
    return (
      <CodePane
        text={inputJson}
        className="tool-test-runtime-code-pane__pre--json"
        emptyText="无输入 JSON"
      />
    );
  }

  if (viewTab === "csharp") {
    return (
      <CodePane
        text={generatedCs}
        className="tool-test-runtime-code-pane__pre--csharp"
        emptyText="无法从 program 生成 C# 预览"
      />
    );
  }

  if (viewTab === "files") {
    if (compiledFiles.length === 0) {
      return (
        <div className="tool-test-runtime-code-pane tool-test-runtime-code-pane--empty">
          <p className="tool-muted">无 file 引用内联（工程目录运行后可见）</p>
        </div>
      );
    }

    return (
      <div className="tool-test-runtime-code-pane tool-test-runtime-code-pane--files">
        {compiledFiles.map((file, index) => {
          const label = [file.sourceFile, file.stepRunnerKey, file.paramKey]
            .filter(Boolean)
            .join(" · ");
          const langClass =
            file.language === "csharp"
              ? "tool-test-runtime-code-pane__pre--csharp"
              : file.language === "expression"
                ? "tool-test-runtime-code-pane__pre--expr"
                : "";
          return (
            <section key={`${file.sourceFile ?? "file"}-${index}`} className="tool-test-runtime-file-block">
              <h4 className="tool-test-runtime-file-block__title">{label}</h4>
              <pre
                className={["tool-test-runtime-code-pane__pre", langClass]
                  .filter(Boolean)
                  .join(" ")}
              >
                {file.content ?? ""}
              </pre>
            </section>
          );
        })}
      </div>
    );
  }

  if (viewTab === "response") {
    return (
      <CodePane
        text={formatJson(run.result?.data ?? run.result)}
        className="tool-test-runtime-code-pane__pre--json"
        emptyText="无响应"
      />
    );
  }

  return (
    <div className="tool-test-runtime-result-view">
      {run.status === "running" ? (
        <p className="tool-muted">等待 qkrpc serve 响应…</p>
      ) : null}

      {run.error ? <p className="tool-test-runtime-result__error">{run.error}</p> : null}

      {assertions ? (
        <div
          className={[
            "tool-test-runtime-result__highlight",
            "tool-test-runtime-result__highlight--compact",
            assertions.passed ? "tool-test-runtime-result__highlight--pass" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className="tool-test-runtime-result__highlight-label">
            断言 {assertions.passed ? "通过" : "失败"}
          </span>
          {Array.isArray(assertions.results) && assertions.results.length > 0 ? (
            <pre>{formatJson(assertions.results)}</pre>
          ) : null}
        </div>
      ) : null}

      {fixHints?.length ? (
        <details className="tool-test-runtime-result__details tool-test-runtime-result__details--compact" open>
          <summary>fixHints ({fixHints.length})</summary>
          <ul className="tool-test-runtime-result__list">
            {fixHints.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {typeof eventCount === "number" || events?.length ? (
        <p className="tool-test-runtime-search__status">
          synthetic trace：{eventCount ?? events?.length ?? 0} events
        </p>
      ) : null}

      {mockLedger && Object.keys(mockLedger).length > 0 ? (
        <details className="tool-test-runtime-result__details tool-test-runtime-result__details--compact">
          <summary>mockLedger</summary>
          <pre className="tool-test-runtime-code-pane__pre">{formatJson(mockLedger)}</pre>
        </details>
      ) : null}

      {outputVars && Object.keys(outputVars).length > 0 ? (
        <dl className="tool-test-runtime-result__vars tool-test-runtime-result__vars--compact">
          {Object.entries(outputVars).map(([key, value]) => (
            <div key={key} className="tool-test-runtime-result__var-row">
              <dt>{key}</dt>
              <dd>
                <code>{typeof value === "string" ? value : formatJson(value)}</code>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {typeof data?.returnResult === "string" && data.returnResult ? (
        <div className="tool-test-runtime-result__highlight tool-test-runtime-result__highlight--compact">
          <span className="tool-test-runtime-result__highlight-label">returnResult</span>
          <pre>{data.returnResult}</pre>
        </div>
      ) : null}

      {typeof data?.errorMessage === "string" && data.errorMessage ? (
        <p className="tool-test-runtime-result__error">{data.errorMessage}</p>
      ) : null}

      {(supported ?? keys)?.length ? (
        <div className="tool-test-runtime-result__chips tool-test-runtime-result__chips--inline">
          <span className="tool-test-runtime-result__chips-title">已支持</span>
          <div className="tool-test-runtime-result__chip-list">
            {(supported ?? keys)!.map((key) => (
              <span key={key} className="tool-test-runtime-result__chip tool-test-runtime-result__chip--ok">
                {key}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {unsupported?.length ? (
        <div className="tool-test-runtime-result__chips tool-test-runtime-result__chips--inline">
          <span className="tool-test-runtime-result__chips-title">不支持</span>
          <div className="tool-test-runtime-result__chip-list">
            {unsupported.map((key) => (
              <span key={key} className="tool-test-runtime-result__chip tool-test-runtime-result__chip--warn">
                {key}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {Array.isArray(data?.logs) && data.logs.length > 0 ? (
        <details className="tool-test-runtime-result__details tool-test-runtime-result__details--compact">
          <summary>日志 ({data.logs.length})</summary>
          <pre className="tool-test-runtime-code-pane__pre">{formatJson(data.logs)}</pre>
        </details>
      ) : null}

      {!run.error
      && !outputVars
      && !data?.returnResult
      && run.status !== "running" ? (
        <p className="tool-muted">切换到上方「输入 JSON / C# 预览」查看 program 与编译产物。</p>
      ) : null}
    </div>
  );
}

export function ToolTestActionRuntimeResultPane({
  runs,
  workingDirectory,
  onClearRuns,
}: ToolTestActionRuntimeResultPaneProps) {
  const ordered = useMemo(
    () => [...runs].sort((a, b) => b.at - a.at),
    [runs],
  );
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<RuntimeViewTab>("result");
  const prevRunCountRef = useRef(0);

  useEffect(() => {
    if (ordered.length === 0) {
      setActiveRunId(null);
      prevRunCountRef.current = 0;
      return;
    }

    if (ordered.length > prevRunCountRef.current) {
      setActiveRunId(ordered[0]!.id);
      setViewTab("result");
    } else if (!activeRunId || !ordered.some((run) => run.id === activeRunId)) {
      setActiveRunId(ordered[0]!.id);
    }

    prevRunCountRef.current = ordered.length;
  }, [ordered, activeRunId]);

  const activeRun = ordered.find((run) => run.id === activeRunId) ?? ordered[0] ?? null;

  const visibleViewTabs = useMemo(() => {
    const files = (
      (activeRun?.result?.data as Record<string, unknown> | undefined)?.compiledFiles as
        | ActionRuntimeCompiledFile[]
        | undefined
    ) ?? [];
    return VIEW_TABS.filter((tab) => tab.id !== "files" || files.length > 0);
  }, [activeRun]);

  return (
    <ToolTestRunsPaneShell
      className="tool-test-runtime-result-pane"
      heading="ActionRuntime 结果"
      subText="每条运行单独一页；下方标签切换输入 JSON / C# / 响应"
      emptyText="在左侧选择预设或填写 JSON / 工程目录后运行"
      runs={ordered}
      workingDirectory={workingDirectory}
      onClearRuns={onClearRuns}
      clearedLabel="已清空 ActionRuntime 记录"
    >
      {activeRun ? (
        <div className="tool-test-runtime-workspace">
          <div
            className="tool-test-runtime-run-tabs"
            role="tablist"
            aria-label="运行记录"
          >
            {ordered.map((run) => {
              const active = run.id === activeRun.id;
              return (
                <button
                  key={run.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={[
                    "tool-test-runtime-run-tab",
                    active ? "tool-test-runtime-run-tab--active" : "",
                    `tool-test-runtime-run-tab--${run.status}`,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  title={run.label}
                  onClick={() => setActiveRunId(run.id)}
                >
                  <span className="tool-test-runtime-run-tab__label">
                    {shortRunLabel(run.label)}
                  </span>
                  <span className="tool-test-runtime-run-tab__meta">
                    {run.op}
                    {run.result ? ` · ${run.result.durationMs}ms` : ""}
                  </span>
                </button>
              );
            })}
          </div>

          <header className="tool-test-runtime-run-head">
            <div className="tool-test-runtime-run-head__main">
              <h3 className="tool-test-runtime-run-head__title">{activeRun.label}</h3>
              <p className="tool-test-runtime-run-head__meta">
                {activeRun.op}
                {activeRun.result ? ` · ${activeRun.result.durationMs} ms` : ""}
                {typeof (activeRun.result?.data as Record<string, unknown> | undefined)?.action ===
                "string"
                  ? ` · ${(activeRun.result!.data as Record<string, unknown>).action}`
                  : ""}
              </p>
            </div>
            <span
              className={`tool-test-runtime-result__badge tool-test-runtime-result__badge--${activeRun.status}`}
            >
              {statusLabel(activeRun.status)}
            </span>
          </header>

          <div
            className="tool-test-runtime-view-tabs"
            role="tablist"
            aria-label="运行详情视图"
          >
            {visibleViewTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={viewTab === tab.id}
                className={[
                  "tool-test-runtime-view-tab",
                  viewTab === tab.id ? "tool-test-runtime-view-tab--active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setViewTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="tool-test-runtime-view-body" role="tabpanel">
            <RunDetailView run={activeRun} viewTab={viewTab} />
          </div>
        </div>
      ) : null}
    </ToolTestRunsPaneShell>
  );
}
