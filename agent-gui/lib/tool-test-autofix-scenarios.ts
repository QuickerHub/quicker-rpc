export type AutoFixScenario = {
  id: string;
  label: string;
  description: string;
  userPrompt: string;
};

export const AUTO_FIX_SCENARIOS: AutoFixScenario[] = [
  {
    id: "value-prefix",
    label: "valuePrefixWarnings（$$/$= 前缀）",
    description:
      "在动作项目 data.json 中写入 {var} 但缺少 $$/$=，触发 valuePrefixWarnings（仅警告）；Agent 识别后修复并完成 patch。",
    userPrompt: [
      "请你在当前工作目录下，创建一个专用的测试动作项目并完成一次“造错→自动修复→再检查”的闭环。",
      "",
      "目标：模拟 agent-gui 在编辑动作时遇到 valuePrefixWarnings（非阻断警告），然后自动修复并 patch。",
      "",
      "步骤要求：",
      "- 创建一个新的动作（标题可用“_tool_test_autofix_prefix”）。",
      "- 将动作导出为本地项目（.quicker/actions/<id> 目录）。",
      "- 用工作区编辑工具修改该项目的 data.json：",
      "  - 定义一个变量 key=n，类型 integer，默认值 1。",
      "  - 添加一个 sys:MsgBox 步骤，它的 message 使用 {n}，但故意写成 value: \"Count: {n}\"（不要加 $$/$= 前缀）。",
      "- 写回应 success=true，并在结果里看到 valuePrefixWarningCount > 0（写入不会被阻断）。",
      "- 读取 warnings 提示的切片位置，按建议自动修复为 \"$$Count: {n}\"（或改成 varKey 绑定也可）。",
      "- patch 保存到 Quicker。",
      "- 最后调用 workspace_program({ action: \"diagnostics\", waitMs: 20000 }) 确认没有语法错误。",
      "",
      "约束：不要读取 data.json 从第 1 行开始来找问题；只用 warnings 给的 startLine/endLine/read 定位。",
    ].join("\n"),
  },
  {
    id: "syntax-lint",
    label: "语法诊断（expression / C#）",
    description:
      "写入一个明显的表达式语法错误，让 qkrpc serve 产出 diagnostics；要求 Agent 定位并修复，再次读取 diagnostics 变为 0 错误。",
    userPrompt: [
      "请你在当前工作目录下，创建一个专用的测试动作项目并完成一次“语法错误→诊断→自动修复→再诊断”的闭环。",
      "",
      "步骤要求：",
      "- 创建一个新的动作（标题可用“_tool_test_autofix_syntax”）。",
      "- 将动作导出为本地项目（.quicker/actions/<id> 目录）。",
      "- 在 data.json 中添加一个 sys:evalexpression 步骤，故意写成 expression: \"1 + \"（语法错误）。",
      "- patch 保存后，调用 workspace_program({ action: \"diagnostics\", waitMs: 20000 }) 读取 issues，使用 location.read/locationSummary 定位问题。",
      "- 自动修复该表达式为合法表达式（例如 \"1 + 1\"），再 patch。",
      "- 再次调用 workspace_program({ action: \"diagnostics\", waitMs: 20000 })，直到 errorCount 为 0。",
    ].join("\n"),
  },
];

export function getAutoFixScenario(id: string): AutoFixScenario | undefined {
  return AUTO_FIX_SCENARIOS.find((s) => s.id === id);
}

