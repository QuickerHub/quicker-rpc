"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import type { ActionStepParam } from "@/lib/action-editor/types/common";
import type { StepRunnerInputParamDef } from "@/lib/action-editor/types/action_query";
import {
  createKeyInputCaptureState,
  keyInputCaptureKeyDown,
  keyInputCaptureKeyUp,
  keyInputCaptureToData,
  resetKeyInputCaptureState,
} from "./keyInputCapture";
import { KeyInputSelectDialog } from "./KeyInputSelectDialog";
import {
  formatKeyInputKeysName,
  isKeyInputWireJson,
  parseKeyInputStepData,
  serializeKeyInputStepData,
} from "./keyInputStepData";
import { isElectronShell } from "@/lib/desktop-shell";

export type KeyboardParamEditorProps = {
  def: StepRunnerInputParamDef;
  param: ActionStepParam;
  onChange: (next: ActionStepParam) => void;
  description?: string;
  onAdvancedMode?: () => void;
};

export function KeyboardParamEditor({
  param,
  onChange,
  description,
  onAdvancedMode,
}: KeyboardParamEditorProps): JSX.Element {
  const [recording, setRecording] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const captureRef = useRef(createKeyInputCaptureState());

  const data = useMemo(() => {
    const raw = (param.value ?? "").trim();
    if (!raw || !isKeyInputWireJson(raw)) {
      return parseKeyInputStepData("{}");
    }
    try {
      return parseKeyInputStepData(raw);
    } catch {
      return parseKeyInputStepData("{}");
    }
  }, [param.value]);

  const displayName = useMemo(() => formatKeyInputKeysName(data), [data]);

  const applyData = useCallback(
    (nextData: ReturnType<typeof parseKeyInputStepData>) => {
      onChange({ ...param, value: serializeKeyInputStepData(nextData), varKey: "" });
    },
    [onChange, param],
  );

  const stopRecording = useCallback(() => {
    setRecording(false);
    resetKeyInputCaptureState(captureRef.current);
  }, []);

  const finishRecording = useCallback(() => {
    const captured = keyInputCaptureToData(captureRef.current);
    if (captured.keys.length > 0 || captured.ctrlKeys.length > 0) {
      applyData(captured);
    }
    stopRecording();
  }, [applyData, stopRecording]);

  const handleCaptureKeyDown = useCallback((event: KeyboardEvent): void => {
    keyInputCaptureKeyDown(event, captureRef.current);
  }, []);

  const handleCaptureKeyUp = useCallback(
    (event: KeyboardEvent): void => {
      if (keyInputCaptureKeyUp(event, captureRef.current)) {
        finishRecording();
      }
    },
    [finishRecording],
  );

  useEffect(() => {
    if (!recording) return;

    if (isElectronShell()) {
      let disposed = false;
      let stopElectron: (() => Promise<void>) | null = null;

      void (async () => {
        const { startElectronKeyInputCapture } = await import("./keyInputElectronCapture");
        if (disposed) return;
        stopElectron = await startElectronKeyInputCapture((event, phase) => {
          if (phase === "keydown") {
            handleCaptureKeyDown(event);
            return;
          }
          handleCaptureKeyUp(event);
        });
        if (disposed) {
          await stopElectron();
          stopElectron = null;
        }
      })();

      return () => {
        disposed = true;
        void stopElectron?.();
      };
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (keyInputCaptureKeyDown(event, captureRef.current)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const onKeyUp = (event: KeyboardEvent): void => {
      if (keyInputCaptureKeyUp(event, captureRef.current)) {
        event.preventDefault();
        event.stopPropagation();
        finishRecording();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
    };
  }, [recording, finishRecording, handleCaptureKeyDown, handleCaptureKeyUp]);

  const toggleRecording = (): void => {
    if (recording) {
      finishRecording();
      return;
    }
    resetKeyInputCaptureState(captureRef.current);
    setRecording(true);
  };

  return (
    <div className="keyboard-param-editor">
      <div className="keyboard-param-keys-label" title={param.value ?? ""}>
        {displayName}
      </div>
      <div className="keyboard-param-toolbar">
        <button
          type="button"
          className={`step-editor-popup-btn secondary keyboard-param-record${recording ? " recording" : ""}`}
          onClick={toggleRecording}
        >
          {recording ? "记录中…" : "录制"}
        </button>
        <button
          type="button"
          className="step-editor-popup-btn secondary keyboard-param-more"
          onClick={() => setSelectorOpen(true)}
          title="选择按键组合"
        >
          …
        </button>
        {onAdvancedMode ? (
          <button
            type="button"
            className="step-editor-popup-btn secondary keyboard-param-advanced"
            onClick={onAdvancedMode}
          >
            变量/表达式
          </button>
        ) : null}
      </div>
      {description ? <div className="step-param-hint">{description}</div> : null}
      <details className="keyboard-param-wire-hint">
        <summary>Wire 格式（Agent）</summary>
        <code className="keyboard-param-wire-code">{serializeKeyInputStepData(data)}</code>
      </details>

      <KeyInputSelectDialog
        open={selectorOpen}
        initial={data}
        onConfirm={(next) => {
          applyData(next);
          setSelectorOpen(false);
        }}
        onCancel={() => setSelectorOpen(false)}
      />
    </div>
  );
}
