import type { JSX } from "react";
import type { ActionVariable } from "@/lib/action-editor/types/common";
import {
  ensureInputParamInfo,
  ensureOutputParamInfo,
  patchInputParamInfo,
  patchOutputParamInfo,
} from "./variableParamInfoHelpers";

type VariableParamInfoPanelProps = {
  variable: ActionVariable;
  onPatch: (next: ActionVariable) => void;
};

export function VariableParamInfoPanel({
  variable,
  onPatch,
}: VariableParamInfoPanelProps): JSX.Element | null {
  const showInput = Boolean(variable.isInput);
  const showOutput = Boolean(variable.isOutput);
  if (!showInput && !showOutput) {
    return null;
  }

  const inputInfo = ensureInputParamInfo(variable);
  const outputInfo = ensureOutputParamInfo(variable);

  return (
    <div className="variable-form-section" role="group" aria-labelledby="variable-form-param-info-title">
      <div id="variable-form-param-info-title" className="variable-form-section-title">
        子程序参数选项
      </div>

      {showInput ? (
        <div className="variable-form-check-list">
          <div className="variable-form-check-block">
            <label className="variable-form-check">
              <input
                type="checkbox"
                checked={inputInfo.multiLine}
                onChange={(event) =>
                  onPatch(patchInputParamInfo(variable, { multiLine: event.target.checked }))
                }
              />
              <span className="variable-form-field-label">多行输入</span>
            </label>
          </div>
          <div className="variable-form-check-block">
            <label className="variable-form-check">
              <input
                type="checkbox"
                checked={inputInfo.isRequired}
                onChange={(event) =>
                  onPatch(patchInputParamInfo(variable, { isRequired: event.target.checked }))
                }
              />
              <span className="variable-form-field-label">必填</span>
            </label>
          </div>
          <div className="variable-form-check-block">
            <label className="variable-form-check">
              <input
                type="checkbox"
                checked={inputInfo.onlyUseSelect}
                onChange={(event) =>
                  onPatch(patchInputParamInfo(variable, { onlyUseSelect: event.target.checked }))
                }
              />
              <span className="variable-form-field-label">仅允许从列表选择</span>
            </label>
          </div>
          <div className="variable-form-check-block">
            <label className="variable-form-check">
              <input
                type="checkbox"
                checked={inputInfo.isAdvanced}
                onChange={(event) =>
                  onPatch(patchInputParamInfo(variable, { isAdvanced: event.target.checked }))
                }
              />
              <span className="variable-form-field-label">高级参数（默认折叠）</span>
            </label>
          </div>
          <label>
            <span className="variable-form-field-label">校验正则</span>
            <input
              value={inputInfo.validationPattern}
              spellCheck={false}
              onChange={(event) =>
                onPatch(patchInputParamInfo(variable, { validationPattern: event.target.value }))
              }
            />
          </label>
          <label>
            <span className="variable-form-field-label">下拉选项（每行一项）</span>
            <textarea
              className="step-param-control step-param-control--multiline"
              rows={3}
              value={inputInfo.selectionItems}
              spellCheck={false}
              onChange={(event) =>
                onPatch(patchInputParamInfo(variable, { selectionItems: event.target.value }))
              }
            />
          </label>
          <label>
            <span className="variable-form-field-label">可见条件表达式</span>
            <input
              value={inputInfo.visibleExpression}
              spellCheck={false}
              placeholder="例如 otherFlag=='yes'"
              onChange={(event) =>
                onPatch(patchInputParamInfo(variable, { visibleExpression: event.target.value }))
              }
            />
            <span className="variable-form-help">引用其它输入参数；留空表示始终显示</span>
          </label>
        </div>
      ) : null}

      {showOutput ? (
        <label>
          <span className="variable-form-field-label">输出参数可见条件</span>
          <input
            value={outputInfo.visibleExpression}
            spellCheck={false}
            placeholder="例如 mode=='detail'"
            onChange={(event) =>
              onPatch(patchOutputParamInfo(variable, { visibleExpression: event.target.value }))
            }
          />
        </label>
      ) : null}
    </div>
  );
}
