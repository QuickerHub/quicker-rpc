# sys:subprogram
<!-- qkrpc-search-aliases: 子程序, 子程序调用, callIdentifier -->

> **分类**：程序流控制 · **来源**：仓库手写 · **官方**：[subprogram](https://getquicker.net/KC/Help/Doc/subprogram)

**用途**：调用动作内 / 公共 / 共享子程序，封装可复用步骤块。

**何时读**：`get` 后需确认 `callIdentifier`、输入输出绑定时；见 **subprogram-workflow**。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 子程序 | `callIdentifier` | 公共子程序用 id 或名称；**禁止**猜名 — `subprogram search/get` |
| 输入/输出 | 与子程序变量名一一映射 | 键名 = 子程序里勾了输入/输出的变量名 |
| 列表/词典传参 | 引用同一对象 | 子程序内改列表/词典会影响主程序 |

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
| 改子程序变量名不更新调用步 | IO 映射断裂 |

## 相关

subprogram-workflow · step-runner-get · workspace-editing · implementation-fallback
