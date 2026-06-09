"use client";

import { useCallback, useEffect, useMemo, useState, type JSX } from "react";
import type { ActionStepParam, ActionVariable } from "@/lib/action-editor/types/common";
import type { StepRunnerInputParamDef } from "@/lib/action-editor/types/action_query";
import { fetchWorkspaceFile } from "@/lib/workspace-explorer-api";
import { CsVarType } from "./csStepEnums";
import {
  FormDefEditorDialog,
  type ActionProjectWorkspaceContext,
  type FormDefEditorSaveResult,
} from "./FormDefEditorDialog";
import {
  parseFormSpecText,
  projectRelativeFilePath,
  summarizeFormSpec,
} from "./formSpecModel";

export type FormDefParamEditorProps = {
  def: StepRunnerInputParamDef;
  param: ActionStepParam;
  onChange: (next: ActionStepParam) => void;
  workspace?: ActionProjectWorkspaceContext;
  variables?: ActionVariable[];
};

type FormDefSummary = {
  title: string;
  fieldCount: number;
  storageLabel: string;
};

function storageLabel(param: ActionStepParam): string {
  const file = param.file?.trim();
  if (file) return file;
  const value = param.value?.trim();
  if (value) return "内联 JSON";
  return "未配置";
}

export function FormDefParamEditor({
  def,
  param,
  onChange,
  workspace,
  variables = [],
}: FormDefParamEditorProps): JSX.Element {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [summary, setSummary] = useState<FormDefSummary>(() => ({
    title: "…",
    fieldCount: 0,
    storageLabel: storageLabel(param),
  }));

  const forDict = def.varType === CsVarType.FormForDict;

  useEffect(() => {
    let cancelled = false;
    const file = param.file?.trim();
    const inline = param.value?.trim();

    void (async () => {
      if (file && workspace) {
        const result = await fetchWorkspaceFile(
          workspace.cwd,
          projectRelativeFilePath(workspace.projectDir, file),
        );
        if (cancelled) return;
        if (!result.ok) {
          setSummary({
            title: "无法读取",
            fieldCount: 0,
            storageLabel: file,
          });
          return;
        }
        const parsed = parseFormSpecText(result.content);
        if (!parsed.ok) {
          setSummary({ title: "格式错误", fieldCount: 0, storageLabel: file });
          return;
        }
        const stats = summarizeFormSpec(parsed.spec);
        setSummary({
          title: stats.title,
          fieldCount: stats.fieldCount,
          storageLabel: file,
        });
        return;
      }

      if (inline) {
        const parsed = parseFormSpecText(inline);
        if (cancelled) return;
        if (!parsed.ok) {
          setSummary({ title: "格式错误", fieldCount: 0, storageLabel: "内联 JSON" });
          return;
        }
        const stats = summarizeFormSpec(parsed.spec);
        setSummary({
          title: stats.title,
          fieldCount: stats.fieldCount,
          storageLabel: "内联 JSON",
        });
        return;
      }

      if (!cancelled) {
        setSummary({
          title: "（未配置）",
          fieldCount: 0,
          storageLabel: storageLabel(param),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [param.file, param.value, workspace]);

  const hint = useMemo(() => {
    if (forDict) {
      return "词典动态表单；推荐使用 files/*.form.json（qkrpc.form.v1）。";
    }
    return "推荐使用外部 files/*.form.json（qkrpc.form.v1），保存动作时会编译进 Quicker。";
  }, [forDict]);

  const handleSave = useCallback(
    (result: FormDefEditorSaveResult) => {
      if (result.mode === "file") {
        onChange({ varKey: "", value: "", file: result.file });
        return;
      }
      onChange({ varKey: "", value: result.value, file: undefined });
    },
    [onChange],
  );

  return (
    <>
      <div className="form-def-param-editor">
        <div className="form-def-param-summary">
          <div className="form-def-param-summary-main">
            <span className="form-def-param-title">{summary.title}</span>
            <span className="form-def-param-meta">
              {summary.fieldCount} 个字段 · {summary.storageLabel}
            </span>
          </div>
          <button
            type="button"
            className="form-def-param-edit-btn"
            onClick={() => setDialogOpen(true)}
          >
            编辑表单…
          </button>
        </div>
        <p className="step-param-hint form-def-param-hint">{hint}</p>
      </div>

      <FormDefEditorDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initialFile={param.file}
        initialValue={param.value}
        workspace={workspace}
        variables={variables}
        forDict={forDict}
        title={(def.name ?? "").trim() || def.key || "编辑表单定义"}
      />
    </>
  );
}
