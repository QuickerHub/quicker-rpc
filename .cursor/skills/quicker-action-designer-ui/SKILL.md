---
name: quicker-action-designer-ui
description: >-
  Guides action designer (action-editor) UI work in agent-gui. UI originates from
  ../Quicker/Quicker.Designer; step double-click popup and per-field editing behavior
  must match ../Quicker/QuickerPc/Quicker ActionDesignerWindow and StepEditor components.
  Use when editing agent-gui/lib/action-editor, StepEditorPopup, param editors, step
  field visibility, or aligning web step editing with desktop Quicker.
disable-model-invocation: false
metadata:
  internal: true
---

# 动作设计器 UI（action-editor）

## 设计来源与对齐基准

| 角色 | 路径（相对 quicker-rpc 仓库根） | 说明 |
|------|----------------------------------|------|
| **Web UI 源码** | `../Quicker/Quicker.Designer` | 动作设计器 Web 前端的**起源**；`Quicker.Designer.Web` 为 React 实现，已迁入本仓库 `agent-gui/lib/action-editor/` |
| **桌面行为基准** | `../Quicker/QuickerPc/Quicker` | Quicker 桌面客户端；**字段编辑细节、交互、可见性规则**以 WPF 为准 |

本机若 Quicker 单体仓库在 `quickerorg` 下，等价路径为：

- `../quickerorg/Quicker/Quicker.Designer`
- `../quickerorg/Quicker/QuickerPc/Quicker`

改 UI 前先确认上述目录在本机存在；不存在时勿猜行为，改查已安装的 `Quicker.exe` 或 `QuickerRpc/QuickerRpc.Plugin.V1` 反射封装。

## 当前任务（优先）

**完善动作设计器对 step 的编辑功能**，重点是 **双击 step 后弹出的步骤编辑弹窗**（`StepEditorPopup`）内每个输入/输出字段的编辑细节，与桌面版对齐：

- 弹窗结构与草稿/应用/放弃逻辑 → `ActionStepEditorWindow`
- 各 `varType` / `variableMode` 选用哪种编辑器 → `InputParamEditorControl.SetupEditor`
- 枚举筛选、变量选择、表达式、表单、外部脚本文件等子控件 → `View/X/StepEditor/ParamEditors/**`
- `ValidFor` / `InvalidFor` / 多操作步骤可见性 → `ActionStepEditorWindow.Visibility.cs`

**原则**：先读 WPF 实现与注释，再在 `agent-gui` 补差距；不要仅凭 `step-runner get`（Agent 压缩 schema）推断 UI 控件形态。

**主题**：新 param 编辑器、弹窗、代码展示等 CSS **默认**用 `action-editor-theme.css` 的 `--ad-*` token，勿写死 hex；见 `quicker-agent-gui-theme`。

## 本仓库实现位置

| 区域 | 路径 |
|------|------|
| 步骤列表 + 双击打开弹窗 | `agent-gui/lib/action-editor/steps/StepListEditor.tsx` |
| 步骤编辑弹窗 | `agent-gui/lib/action-editor/steps/paramEditors/StepEditorPopup.tsx` |
| 输入字段路由 | `agent-gui/lib/action-editor/steps/paramEditors/StepInputParamField.tsx` |
| 输出字段 | `agent-gui/lib/action-editor/steps/paramEditors/StepOutputParamField.tsx` |
| 变量/字面量 | `VarOrValueParamEditor.tsx`、`StepVariablePicker.tsx` |
| 表单定义 | `FormDefParamEditor.tsx`、`formSpecModel.ts` |
| 外部参数文件（脚本等） | `ExternalParamFileExpressionEditor.tsx` |
| 字段可见性 | `agent-gui/lib/action-editor/steps/stepParamVisibility.ts` |
| 样式 | `agent-gui/components/action-editor/action-editor.css` |
| 主题 token | `agent-gui/components/action-editor/action-editor-theme.css`（`--ad-*`） |
| 程序编辑入口 | `agent-gui/lib/action-editor/program/XProgramEditor.tsx` |
| Step-runner UI schema | 静态 `step-runners-ui-catalog.json`（优先）；live `qkrpc step-runner get-ui`（维护导出 / `STEP_RUNNER_CATALOG_LIVE=1`） |
| Designer Host gRPC | `agent-gui/lib/action-editor/shared/designerHostGrpcApi.ts` |

## WPF ↔ Web 对照表（步骤字段）

桌面 `InputParamEditorControl.SetupEditor` 路由（实现细节以源码为准）：

| 条件 | WPF 编辑器 | Web（agent-gui） |
|------|------------|------------------|
| `Boolean` + `Input` | `BooleanParamEditor` | `StepInputParamField` 内 checkbox |
| `Form` / `FormForDict` | `FormParamEditor` | `FormDefParamEditor` |
| `Enum` + `Input` + 有选项 | `EnumParamEditor` | 可筛选下拉（`step-param-enum-*`）；`allowInput` 可手输；过时值 `【已过时】` |
| `UseVarOnly` 且值为空 | `VariableParamSelector` | `StepVariablePicker` |
| `key == texttools` | `TextToolsParamEditor` / `TextToolsSelectorControl` | `TextToolsParamEditor.tsx` + `textToolCatalog.ts` |
| 输出参数创建变量 | `VariableSelector` + `isForOutput` | `StepOutputParamField` + `onCommitVariables` |
| 枚举预选值转手工/表达式 | `EnumParamValueControl` 上下文菜单 | `VarOrValueParamEditor`「手工填写」「$=」 |
| `UseVarOnly` + 空 value | `VariableParamSelector` | `shouldUseVariableOnlyPicker` + `StepVariablePicker` |
| `UseVarOnly` + 有 expression | `VarAndValueParamEditor` | `shouldUseVarOrValueEditor(def, param)` |
| `UseVar` | `VarAndValueParamEditor` | `shouldUseVarOrValueEditor`（勿与 UseVarOnly 混用） |
| 伪变量 `[cliptext]` / `quicker_in_param` | VarAndValue 列表 | `stepParamBuiltinVariables.ts` |
| 新建变量 / 双击标签 | `XActionUiHelper.CreateVariable` | `StepCreateVariableDialog` + `onCommitVariables` |
| 其它可输入 | `VarAndValueParamEditor` | `VarOrValueParamEditor` + `ExpressionEditor` |
| 字段旁 TextTools 工具条 | `VarAndValueParamEditor.TextTools1` | `ParamTextToolsStrip.tsx`（浏览器文件选择；其余提示桌面版） |

弹窗级逻辑对照：

| 桌面 | Web |
|------|-----|
| `ActionStepEditorWindow.xaml(.cs)` | `StepEditorPopup.tsx` |
| `ActionStepEditorWindow.InputParams.cs` | `StepInputParamField` 列表渲染 |
| `ActionStepEditorWindow.OutputParams.cs` | `StepOutputParamField` |
| `ActionStepEditorWindow.Visibility.cs` | `stepParamVisibility.ts`（`buildStepParamValuesForVisibility` 优先 `varKey`） |
| `ActionStepEditorWindow.WindowSizing.cs` | 弹窗 CSS / 布局（`action-editor.css`） |
| 双击字段标签创建变量 | `StepParamLabel` + `VarOrValueParamEditor` |

主设计器窗口（步骤列表上下文菜单、保存、子程序等）：

| 桌面 | Web |
|------|-----|
| `View/X/ActionDesignerWindow*.cs` | `XProgramEditor.tsx`、`StepListEditor.tsx` |
| `View/X/Controls/ActionStepsWrapper.xaml.cs` | 步骤列表交互、`actionStepsClipboard.ts` |

## 推荐工作流

1. **定位差距**：在 Quicker 桌面版复现（双击 step → 改某字段），记录预期交互。
2. **读 WPF**：`rg "SetupEditor|ValidFor|TriggerCreateVariable" ../Quicker/QuickerPc/Quicker/View/X/StepEditor`（或 `quickerorg` 等价路径）。
3. **读 Web 源**：对比 `../Quicker/Quicker.Designer/src/Quicker.Designer.Web/src/features/steps/` 是否已有移植；再改 `agent-gui/lib/action-editor/`。
4. **Schema（静态优先）**：action-editor 使用编译期打包的 `agent-gui/lib/action-editor/data/step-runners-ui-catalog.json`（`Export-StepRunnersUiCatalog.ps1` 从 `qkrpc step-runner get-ui` 导出）。`/api/step-runner/list|get` 默认读静态 JSON；`STEP_RUNNER_CATALOG_LIVE=1` 或 catalog 为空时回退 live `qkrpc`。键名与 `controlField` 与 Agent 路径一致，但 **控件形态只看 UI schema + WPF**。
5. **改完后**：**自动**跑 `dev_frontend_check` 直到 `ok: true`（或 `/frontend-check`）；见 `quicker-agent-gui-frontend`（**不要** `build.ps1 -t`）。
6. **涉及插件保存/designer host**：才需要 `quicker-rpc-build-test`（`QuickerRpc/QuickerRpc.Plugin.V1/Services/ActionDesigner*.cs`）。

## 搜索命令（维护者本机）

```powershell
# 从 quicker-rpc 根目录
rg "SetupEditor" ../Quicker/QuickerPc/Quicker/View/X/StepEditor
rg "ActionStepEditorWindow" ../Quicker/QuickerPc/Quicker/View/X
rg "StepEditorPopup" ../Quicker/Quicker.Designer
rg "shouldUseVarOrValueEditor" agent-gui/lib/action-editor
```

## 相关

- 前端收尾：`quicker-agent-gui-frontend` / `/frontend-check`
- **主题 token**：`quicker-agent-gui-theme`（新组件/CSS 默认适配深/浅）
- Quicker.exe 反射 / 类型探测：`.cursor/skills/quicker-exe-type-probing/SKILL.md`
- `step-runner get-ui` 说明：`docs/cli-commands.md`、`agent-gui/AGENTS.md`（Action editor）
- 插件侧设计器接入：`QuickerRpc/QuickerRpc.Plugin.V1/Services/ActionDesignerProgramAccess.cs`、`ActionDesignerUiSave.cs`
