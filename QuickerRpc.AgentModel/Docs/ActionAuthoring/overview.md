# Overview（动作编辑入口）
无头编辑 XAction：**`qkrpc`** + QuickerRpc 插件。命令表：`qkrpc help --json`。环境：**`cli-setup`**。逐步操作：**`authoring-workflow`**。
## 编辑链路（必读顺序）
```text
阶段  目的                    命令 / 主题
────  ──────────────────────  ─────────────────────────────────────────
 P0   连通                    ping · cli-setup
 P1   定位动作                action create · list/search → actionId
 P2   读取快照                action get → editVersion · steps/variables
      return-mode             structure | full | metadata → xaction-json
 P3   元数据（可选）          set-metadata · patch 顶层 title/icon → action-icons
 P4   实现选型                implementation-fallback → expressions 或步骤模块
 P5   步骤 schema             step-modules → step-runner search → step-runner get
 P6   写入保存                action patch（一次调用=一次保存）→ patch-workflow
      整页替换                action replace（少用）
 P7   收尾                    以 patch/set-metadata 响应的 editVersion 等为准
```
**子程序调用**（动作内调公共子程序）：在 P5–P6 之间插入 **`subprogram-workflow`**（`callIdentifier` + `sys:subprogram`）。
**变量**：读写在 P2/P6；类型与 patch 见 **`variables`**。
## 常见校验（由 qkrpc 返回说明）
| 场景 | 失败时参考 |
|------|------------|
| `inputParams` 键名 | `step-runner get`；未知键见 patch 的 `warnings[]` |
| `callIdentifier` | `subprogram search/get` |
| `icon` spec | `fa search` · **`action-icons`** · 响应 `errorMessage` |
| patch 后确认 | 成功响应的 `editVersion` / `addedSteps`，不必再 `action get` |
## 专题索引
| 主题 | 何时读 |
|------|--------|
| **`authoring-workflow`** | 执行 P1–P7 的命令与示例 |
| **`patch-workflow`** | patch JSON、默认值省略、保存后字段 |
| **`xaction-json`** | `return-mode`、stepId、nodePath |
| **`action-icons`** | fa search、icon 字符串格式 |
| **`step-modules`** | 常用 stepRunnerKey 速查 |
| **`step-runner-search`** | 目录搜索语法 |
| **`implementation-fallback`** | 无模块 / 表达式 vs C# |
| **`expressions`** | `$=`、`$$` 参数表达式 |
| **`variables`** | 变量 type、patch |
| **`subprogram-workflow`** | 公共子程序与 `sys:subprogram` |
| **`cli-setup`** | P0 安装与最小命令链 |
| **`action-project-files`** | 大段 inputParams 用 `file` + `.quicker` 目录 export/import |
