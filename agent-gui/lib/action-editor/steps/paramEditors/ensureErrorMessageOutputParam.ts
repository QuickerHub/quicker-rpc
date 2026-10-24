import type { StepRunnerItem } from "../../types/action_query";
import { StepRunnerOutputParamDef } from "../../types/action_query";
import { CsVarType } from "./csStepEnums";

/** Quicker 574556d76b: ActionStepEditorWindow.xaml.cs:317-323 and StepOutParamDef. */
export const ERROR_MESSAGE_OUTPUT_PARAM_KEY = "errMessage";

/** Project the native shared error output without modifying the bound catalog or its UI-only fields. */
export function ensureErrorMessageOutputParam(runner: StepRunnerItem | undefined): StepRunnerItem | undefined {
  if (!runner || (runner.key ?? "").trim() === "sys:group") return runner;
  const outputs = runner.outputParamDefs ?? [];
  if (!outputs.some((def) => (def.key ?? "").trim() === "isSuccess")
    || outputs.some((def) => (def.key ?? "").trim() === ERROR_MESSAGE_OUTPUT_PARAM_KEY)) return runner;
  return {
    ...runner,
    outputParamDefs: [...outputs, StepRunnerOutputParamDef.fromPartial({
      key: ERROR_MESSAGE_OUTPUT_PARAM_KEY,
      name: "错误消息",
      description: "步骤执行出错时的消息",
      varType: CsVarType.Text,
    })],
  };
}
