import assert from "node:assert/strict";
import { test } from "node:test";
import { ActionStep } from "@/lib/action-editor/types/common";
import { buildSummaryFromParts } from "@/lib/action-editor/steps/stepSummaryFromParts";
import { buildClientStepSummary } from "@/lib/action-editor/steps/stepSummaryFallback";
import { CsVarType } from "@/lib/action-editor/steps/paramEditors/csStepEnums";
import {
  collectStepParamFilePaths,
  resolveStepListSecondarySummary,
  summaryLooksLikeStepFilePath,
} from "@/lib/action-editor/steps/stepSummaryFileRefs";

const scriptParamDef = {
  key: "script",
  name: "脚本",
  description: "",
  varType: CsVarType.Text,
  variableMode: 0,
  isMultiLine: true,
  isRequired: true,
  validationPattern: "",
  selectionItems: [],
  isControlField: false,
  defaultValue: "",
  fromOldField: "",
  isAdvanced: false,
  allowInput: true,
  visibleExpression: "",
  replaceVariable: false,
  defaultHighlightType: "",
  skipEval: false,
  skipLogContent: false,
  validForList: [],
  invalidForList: [],
};

test("collectStepParamFilePaths walks branches", () => {
  const steps = [
    ActionStep.fromPartial({
      stepRunnerKey: "if",
      ifSteps: [
        ActionStep.fromPartial({
          stepRunnerKey: "sys:csscript",
          inputParams: { script: { file: "files/a.cs" } },
        }),
      ],
      elseSteps: [
        ActionStep.fromPartial({
          stepRunnerKey: "sys:csscript",
          inputParams: { script: { file: "files/b.cs" } },
        }),
      ],
    }),
    ActionStep.fromPartial({
      stepRunnerKey: "sys:csscript",
      inputParams: { script: { file: "files/a.cs" } },
    }),
  ];
  assert.deepEqual(collectStepParamFilePaths(steps).sort(), ["files/a.cs", "files/b.cs"]);
});

test("buildSummaryFromParts resolves external file content when loaded", () => {
  const step = ActionStep.fromPartial({
    stepRunnerKey: "sys:csscript",
    inputParams: {
      script: { value: "", file: "files/csscript1.cs" },
    },
  });
  const summary = buildSummaryFromParts(
    ["script:60"],
    step,
    [scriptParamDef],
    [],
    { "files/csscript1.cs": "return 1 + 1;\n" },
  );
  assert.equal(summary, "return 1 + 1;");
});

test("buildSummaryFromParts falls back to file path when content missing", () => {
  const step = ActionStep.fromPartial({
    stepRunnerKey: "sys:csscript",
    inputParams: {
      script: { value: "", file: "files/csscript1.cs" },
    },
  });
  const summary = buildSummaryFromParts(["script:60"], step, [scriptParamDef]);
  assert.equal(summary, "files/csscript1.cs");
});

test("buildClientStepSummary reads csscript script from file contents", () => {
  const step = ActionStep.fromPartial({
    stepRunnerKey: "sys:csscript",
    inputParams: {
      script: { value: "", file: "files/wait-clipboard-log.cs" },
    },
  });
  assert.equal(
    buildClientStepSummary(step, undefined, {
      "files/wait-clipboard-log.cs": "// wait clipboard\nLog(\"ok\");",
    }),
    "// wait clipboard Log(\"ok\");",
  );
});

test("resolveStepListSecondarySummary prefers file content over backend path placeholder", () => {
  const step = ActionStep.fromPartial({
    stepRunnerKey: "sys:csscript",
    inputParams: {
      script: { value: "", file: "files/wait-clipboard-log.cs" },
    },
  });
  const summary = resolveStepListSecondarySummary(
    step,
    undefined,
    "files/wait-clipboard-log.cs",
    { "files/wait-clipboard-log.cs": "Log(\"clipboard\");" },
  );
  assert.equal(summary, "Log(\"clipboard\");");
});

test("summaryLooksLikeStepFilePath detects backend placeholder", () => {
  const step = ActionStep.fromPartial({
    inputParams: { script: { file: "files/a.cs" } },
  });
  assert.equal(summaryLooksLikeStepFilePath("files/a.cs", step), true);
  assert.equal(summaryLooksLikeStepFilePath("Log hello", step), false);
});
