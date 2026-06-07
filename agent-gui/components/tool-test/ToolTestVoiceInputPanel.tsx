"use client";

import { useCallback, useRef, useState } from "react";
import { useVoicePluginStatus } from "@/lib/voice-input/use-voice-plugin-status";
import {
  canUseVoiceInput,
  isVoiceInputMockEnabled,
  voicePluginStatusLabel,
} from "@/lib/voice-input/voice-input-plugin-status";
import {
  runVoiceStartupBenchmark,
  type VoiceStartupBenchmarkMode,
} from "@/lib/voice-input/voice-input-startup-benchmark";
import {
  createVoiceInputRunId,
  VOICE_STARTUP_MODE_LABELS,
  type VoiceInputRunEntry,
} from "@/lib/tool-test-voice-input-runs";

type ToolTestVoiceInputPanelProps = {
  disabled?: boolean;
  onAppendRun: (entry: VoiceInputRunEntry) => void;
  onPatchRun: (id: string, patch: Partial<VoiceInputRunEntry>) => void;
};

const BENCHMARK_MODES: VoiceStartupBenchmarkMode[] = [
  "mic-only",
  "ws-only",
  "production-sequential",
  "mic-first-parallel",
  "composer-simulate",
];

function formatMs(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value} ms`;
}

export function ToolTestVoiceInputPanel({
  disabled,
  onAppendRun,
  onPatchRun,
}: ToolTestVoiceInputPanelProps) {
  const pluginStatus = useVoicePluginStatus(true);
  const [runningMode, setRunningMode] = useState<VoiceStartupBenchmarkMode | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);

  const mockEnabled = isVoiceInputMockEnabled();
  const canRun = !mockEnabled && canUseVoiceInput(pluginStatus);

  const runBenchmark = useCallback(
    async (mode: VoiceStartupBenchmarkMode) => {
      if (disabled || runningMode) return;
      if (mockEnabled) return;
      if (!canUseVoiceInput(pluginStatus)) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const entry: VoiceInputRunEntry = {
        id: createVoiceInputRunId(),
        at: Date.now(),
        mode,
        modeLabel: VOICE_STARTUP_MODE_LABELS[mode],
        status: "running",
      };
      onAppendRun(entry);
      setRunningMode(mode);

      try {
        const timings = await runVoiceStartupBenchmark(mode, {
          signal: controller.signal,
        });
        onPatchRun(entry.id, { status: "done", timings });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          onPatchRun(entry.id, { status: "error", error: "已取消" });
        } else {
          const message = err instanceof Error ? err.message : "测试失败";
          onPatchRun(entry.id, { status: "error", error: message });
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        setRunningMode(null);
      }
    },
    [disabled, mockEnabled, onAppendRun, onPatchRun, pluginStatus, runningMode],
  );

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <div className="voice-bench-panel">
      <p className="voice-bench-panel__intro">
        测量从点击到麦克风/语音服务就绪的各阶段耗时。生产流程当前为 WS 连接后再开麦克风；
        「麦克风优先」为并行启动并在 WS 就绪前缓冲 PCM。
      </p>

      <dl className="voice-bench-panel__status">
        <div>
          <dt>语音状态</dt>
          <dd>{voicePluginStatusLabel(pluginStatus)}</dd>
        </div>
        <div>
          <dt>Mock</dt>
          <dd>{mockEnabled ? "已开启（请关闭后测试）" : "关闭"}</dd>
        </div>
      </dl>

      {!canRun && !mockEnabled ? (
        <p className="voice-bench-panel__warn">
          语音服务未就绪，请先在设置或标题栏安装/启动 Runtime。
        </p>
      ) : null}

      {mockEnabled ? (
        <p className="voice-bench-panel__warn">
          Mock 模式跳过真实麦克风，请在设置 → 语音输入关闭 Mock。
        </p>
      ) : null}

      <div className="voice-bench-panel__actions">
        {BENCHMARK_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            className="voice-bench-panel__btn"
            disabled={disabled || !canRun || runningMode !== null}
            onClick={() => void runBenchmark(mode)}
            title={VOICE_STARTUP_MODE_LABELS[mode]}
          >
            {runningMode === mode
              ? "运行中…"
              : VOICE_STARTUP_MODE_LABELS[mode]}
          </button>
        ))}
      </div>

      {runningMode ? (
        <button
          type="button"
          className="voice-bench-panel__btn voice-bench-panel__btn--ghost"
          onClick={handleCancel}
        >
          取消当前测试
        </button>
      ) : null}

      <details className="voice-bench-panel__legend">
        <summary>指标说明</summary>
        <ul>
          <li>
            <strong>麦克风就绪</strong>：getUserMedia + AudioContext 完成
          </li>
          <li>
            <strong>首块 PCM</strong>：ScriptProcessor 第一次输出音频
          </li>
          <li>
            <strong>WS 连接 / Session</strong>：WebSocket 打开与 session.started
          </li>
          <li>
            <strong>可发送</strong>：生产流程=首块已发往 WS；并行=缓冲已 flush
          </li>
          <li>
            <strong>缓冲</strong>：并行模式下 WS 就绪前暂存的块数/字节
          </li>
        </ul>
      </details>
    </div>
  );
}

export function formatVoiceTimingRow(
  label: string,
  value: number | null | undefined,
): { label: string; value: string } {
  return { label, value: formatMs(value) };
}
