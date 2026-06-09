/** Presets for /tool-test ActionRuntime panel (standalone — no Quicker). */

export type ActionRuntimeInlineProgram = {
  title: string;
  steps: unknown[];
  variables: unknown[];
  subPrograms?: unknown[];
};

export type ActionRuntimeTestCase = {
  id: string;
  label: string;
  description: string;
  /** Short tag shown in sidebar grouping */
  tag: "基础" | "流程" | "数据" | "子程序" | "预览";
  program: ActionRuntimeInlineProgram;
};

export const ACTION_RUNTIME_PRESET_CASES: ActionRuntimeTestCase[] = [
  {
    id: "assign-ok",
    label: "赋值 Smoke",
    tag: "基础",
    description: "sys:assign 字面量 → result",
    program: {
      title: "_runtime_assign_smoke",
      steps: [
        {
          stepRunnerKey: "sys:assign",
          inputParams: { input: "ok" },
          outputParams: { output: "result" },
        },
      ],
      variables: [{ key: "result", default: "" }],
    },
  },
  {
    id: "wire-expr-mix",
    label: "Wire：$$ / $= / .var",
    tag: "基础",
    description: "插值 + 表达式 + 变量引用（JSON→C# 预览重点）",
    program: {
      title: "_runtime_wire_expr",
      steps: [
        {
          stepRunnerKey: "sys:assign",
          inputParams: { input: "$$prefix_{name}" },
          outputParams: { output: "greet" },
        },
        {
          stepRunnerKey: "sys:evalexpression",
          inputParams: { expression: "$=10 + {len}" },
          outputParams: { result: "sum" },
        },
        {
          stepRunnerKey: "sys:assign",
          inputParams: { "input.var": "sum" },
          outputParams: { output: "copied" },
        },
      ],
      variables: [
        { key: "name", default: "world" },
        { key: "len", default: "32" },
        { key: "greet", default: "" },
        { key: "sum", default: "" },
        { key: "copied", default: "" },
      ],
    },
  },
  {
    id: "if-nested",
    label: "If + 嵌套分支",
    tag: "流程",
    description: "sys:if / elseSteps + 内层 assign",
    program: {
      title: "_runtime_if_nested",
      steps: [
        {
          stepRunnerKey: "sys:assign",
          inputParams: { input: "1" },
          outputParams: { output: "flag" },
        },
        {
          stepRunnerKey: "sys:if",
          inputParams: { condition: "$={flag} > 0" },
          ifSteps: [
            {
              stepRunnerKey: "sys:if",
              inputParams: { condition: "true" },
              ifSteps: [
                {
                  stepRunnerKey: "sys:assign",
                  inputParams: { input: "inner-yes" },
                  outputParams: { output: "branch" },
                },
              ],
              elseSteps: [
                {
                  stepRunnerKey: "sys:assign",
                  inputParams: { input: "inner-no" },
                  outputParams: { output: "branch" },
                },
              ],
            },
          ],
          elseSteps: [
            {
              stepRunnerKey: "sys:assign",
              inputParams: { input: "outer-no" },
              outputParams: { output: "branch" },
            },
          ],
        },
      ],
      variables: [
        { key: "flag", default: "0" },
        { key: "branch", default: "" },
      ],
    },
  },
  {
    id: "repeat-accumulate",
    label: "Repeat 累加",
    tag: "流程",
    description: "sys:repeat + sys:compute 循环累加 total",
    program: {
      title: "_runtime_repeat_sum",
      steps: [
        {
          stepRunnerKey: "sys:assign",
          inputParams: { input: "0" },
          outputParams: { output: "total" },
        },
        {
          stepRunnerKey: "sys:repeat",
          inputParams: { count: "3", repeatDelayMs: "0" },
          ifSteps: [
            {
              stepRunnerKey: "sys:compute",
              inputParams: {
                expression: "{total}+1",
                evalVar: "true",
              },
              outputParams: { output: "total" },
            },
          ],
        },
      ],
      variables: [{ key: "total", default: "0" }],
    },
  },
  {
    id: "each-loop",
    label: "Each 遍历",
    tag: "流程",
    description: "sys:each 列表 + 子步骤写 item 变量",
    program: {
      title: "_runtime_each",
      steps: [
        {
          stepRunnerKey: "sys:assign",
          inputParams: { input: "a,b,c" },
          outputParams: { output: "csv" },
        },
        {
          stepRunnerKey: "sys:splitString",
          inputParams: {
            data: "a,b,c",
            separator: ",",
          },
          outputParams: { output: "parts" },
        },
        {
          stepRunnerKey: "sys:each",
          inputParams: { "input.var": "parts", useMultiThread: "0" },
          ifSteps: [
            {
              stepRunnerKey: "sys:assign",
              inputParams: { "input.var": "item" },
              outputParams: { output: "last" },
            },
          ],
          outputParams: { item: "item" },
        },
      ],
      variables: [
        { key: "csv", default: "" },
        { key: "parts", default: "" },
        { key: "item", default: "" },
        { key: "last", default: "" },
      ],
    },
  },
  {
    id: "split-join-pipeline",
    label: "Split → Join 管道",
    tag: "数据",
    description: "sys:splitString + sys:joinList，.var 传列表",
    program: {
      title: "_runtime_split_join",
      steps: [
        {
          stepRunnerKey: "sys:splitString",
          inputParams: {
            data: "red|green|blue",
            separator: "|",
          },
          outputParams: { output: "parts" },
        },
        {
          stepRunnerKey: "sys:joinList",
          inputParams: {
            "list.var": "parts",
            separator: ",",
          },
          outputParams: { output: "joined" },
        },
      ],
      variables: [
        { key: "parts", default: "" },
        { key: "joined", default: "" },
      ],
    },
  },
  {
    id: "json-extract",
    label: "JSON 多路径提取",
    tag: "数据",
    description: "sys:jsonExtract，p0/p1 多输出",
    program: {
      title: "_runtime_json_extract",
      steps: [
        {
          stepRunnerKey: "sys:jsonExtract",
          inputParams: {
            data: "{\"user\":{\"name\":\"alice\"},\"count\":3}",
            p0: "user.name",
            p1: "count",
            dateAsString: "false",
          },
          outputParams: {
            v0: "name",
            v1: "count",
          },
        },
      ],
      variables: [
        { key: "name", default: "" },
        { key: "count", default: "" },
      ],
    },
  },
  {
    id: "embedded-subprogram",
    label: "内嵌子程序 IO",
    tag: "子程序",
    description: "subPrograms[] + sys:subprogram + var: 绑定；C# 预览为 RunSp",
    program: {
      title: "_runtime_embedded_sp",
      steps: [
        {
          stepRunnerKey: "sys:assign",
          inputParams: { input: "21" },
          outputParams: { output: "seed" },
        },
        {
          stepRunnerKey: "sys:subprogram",
          inputParams: {
            subProgram: "Double",
            "var:value.var": "seed",
            stopIfFail: "1",
            skipDebugOutput: "0",
          },
          outputParams: {
            "var:result": "answer",
            isSuccess: "ok",
          },
        },
      ],
      variables: [
        { key: "seed", default: "0" },
        { key: "answer", default: "" },
        { key: "ok", default: "" },
      ],
      subPrograms: [
        {
          name: "Double",
          steps: [
            {
              stepRunnerKey: "sys:compute",
              inputParams: {
                expression: "{value}*2",
                evalVar: "true",
              },
              outputParams: { output: "result" },
            },
          ],
          variables: [
            { key: "value", default: "0", isInput: true },
            { key: "result", default: "0", isOutput: true },
          ],
        },
      ],
    },
  },
  {
    id: "group-sequence",
    label: "Group 顺序块",
    tag: "流程",
    description: "sys:group 打包多步顺序执行",
    program: {
      title: "_runtime_group",
      steps: [
        {
          stepRunnerKey: "sys:group",
          ifSteps: [
            {
              stepRunnerKey: "sys:assign",
              inputParams: { input: "step-1" },
              outputParams: { output: "a" },
            },
            {
              stepRunnerKey: "sys:assign",
              inputParams: { "input.var": "a" },
              outputParams: { output: "b" },
            },
            {
              stepRunnerKey: "sys:assign",
              inputParams: { input: "$$done:{b}" },
              outputParams: { output: "tag" },
            },
          ],
        },
      ],
      variables: [
        { key: "a", default: "" },
        { key: "b", default: "" },
        { key: "tag", default: "" },
      ],
    },
  },
  {
    id: "unsupported-preview",
    label: "未支持模块（ExecuteStep 预览）",
    tag: "预览",
    description: "sys:stateStorage 等走 ExecuteStep fallback，测 JSON→C#",
    program: {
      title: "_runtime_unsupported_preview",
      steps: [
        {
          stepRunnerKey: "sys:stateStorage",
          inputParams: {
            type: "readActionState",
            key: "ClipboardData",
            defaultValue: "[]",
          },
          outputParams: { value: "state" },
        },
      ],
      variables: [{ key: "state", default: "" }],
    },
  },
];

export function getDefaultActionRuntimeTestCase(): ActionRuntimeTestCase {
  return ACTION_RUNTIME_PRESET_CASES[0]!;
}
