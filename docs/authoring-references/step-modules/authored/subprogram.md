# sys:subprogram

> **分类**：程序流控制 · **来源**：仓库手写 · **官方**：[subprogram](https://getquicker.net/KC/Help/Doc/subprogram)

**用途**：调用动作内 / 公共 / 共享子程序，封装可复用步骤块。

**何时读**：`get` 后需确认 `callIdentifier`、输入输出绑定时；见 **subprogram-workflow**。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 子程序 | `callIdentifier` / `subProgram` | 公共子程序用 `%%{guid}` 或名称；**禁止**猜名 — `subprogram search/get` |
| 输入 | **`var:<子程序变量key>`** | 映射主程序变量，如 `"var:text": { "varKey": "inputText" }` 或 `"var:text": "inputText"` |
| 输出 | **`var:<子程序变量key>`** | 在 `outputParams`，如 `"var:result": "outputText"` |
| 列表/词典传参 | 引用同一对象 | 子程序内改列表/词典会影响主程序 |

**不是**普通步骤的 `text.var` / `path.var` 写法。`step-runner get` 静态 schema 可能不列出 `var:*` 键；patch 可出 warning，**运行有效**（B04 验证）。

### 最小示例（主动作调用步）

```json
{
  "stepRunnerKey": "sys:subprogram",
  "inputParams": {
    "subProgram": "%%<guid>",
    "var:text": { "varKey": "inputText" }
  },
  "outputParams": {
    "var:result": "outputText",
    "isSuccess": "spOk"
  }
}
```

键名 `text` / `result` 须与子程序 `variables[]` 里 `isInput` / `isOutput` 的 `key` 一致。参考：`action-patterns/subprogram-extract.md`、`scripts/voxtype-quicker/voxtype-run-subprogram.patch.json`。

## 模式（子程序类别）

| 类别 | 存储 | Agent |
|------|------|-------|
| 动作内 | `data.json` 内嵌 | `target: embedded_subprogram` |
| 公共 | 磁盘 `.quicker` | `target: global_subprogram` |
| 网络共享 | getquicker | 拖放或 search；写步骤仍要 `get` 定 IO |

变量作用域：子程序每次运行独立初始化；勿与主程序同名变量（除非刻意）。

## 禁止 / 常见错误

| 写法 | 问题 |
|------|------|
| 未 `subprogram get` 猜 `callIdentifier` | 调用失败 |
| 用 `text.var` 绑子程序 IO | 运行时不传参；应用 **`var:<key>`** |
| 改子程序变量名不更新调用步 | IO 映射断裂 |

## 相关

subprogram-workflow · step-runner-get · workspace-editing · implementation-fallback
