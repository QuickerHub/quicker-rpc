# 实现方式与回退链路

**何时阅读**：`step-modules` / `step-runner search` **找不到**合适模块；或需求是「计算 / 判断 / 拼装逻辑」而非固定 UI 操作。**必须**按本文选型，**禁止**假设存在仅在内置程序集里的类型（如 `ManagedShell.*`、`ShellHelper` 等），除非 **`step-runner get`** 的 schema 或用户明确提供引用。

## 总体优先级（先权衡，再搜模块）

在盲目 **`step-runner search`** 之前，按下面顺序判断能否用**更少步骤、更可移植**的方式完成：

| 优先级 | 手段 | `stepRunnerKey` / 写法 | 适用 |
|--------|------|------------------------|------|
| **1** | 参数内表达式 | `$=` / `$$` / `{varKey}` | 单步内的条件、拼接、简单运算；见 **`expressions`** |
| **2** | 执行表达式步骤 | `sys:evalexpression` | 多行赋值、列表/字符串处理、分支前准备变量 |
| **3** | 专用步骤模块 | `step-modules` → **`step-runner get`** | 剪贴板、HTTP、文件、弹窗等有官方模块的能力 |
| **4** | 运行 C# 代码 | `sys:csscript` | 无专用模块；需 Win32 / 自定义算法；脚本应**自包含**或仅用 Quicker 文档允许的引用 |
| **5** | 运行脚本 | `sys:runScript`（PS/CMD 等） | 注册表、系统命令、不依赖 Quicker 程序集 |
| **6** | 运行/打开 | `sys:run` | 调用外部 exe、官方 CLI |
| **7** | 脆弱兜底 | 模拟按键、菜单自动化等 | 仅在前述均不可行时；须在说明中标注环境依赖 |

**原则**：能用 **1–2** 解决的，不要堆多个专用步骤；能用 **3** 的，不要写 **4**；**4** 不要引用用户环境未必存在的内部 DLL。

## 回退流程（找不到模块时）

```text
需求分析
  → 是否仅为赋值/计算/比较/格式化？
       是 → expressions（参数 $=）或 sys:evalexpression
       否 ↓
  → step-modules 是否有对应 key？
       是 → step-runner get → action patch
       否 ↓
  → step-runner search（单次：`|` OR、`*` 通配符，见 step-runner-search）
       有结果 → step-runner get → 选用
       无结果 ↓
  → 是否可用 Windows 通用机制（注册表、cmd、PowerShell）？
       是 → sys:runScript / sys:run
       否 ↓
  → sys:csscript（自包含 P/Invoke 或 BCL；可选 reference 仅列用户提供的 DLL）
       失败 → 缩小范围：notify 说明限制 / 请用户确认环境
```

## `sys:evalexpression` 与 `sys:csscript` 的分工

| | `sys:evalexpression` | `sys:csscript` |
|--|---------------------|----------------|
| **适合** | `{a}={b}+1`、LINQ 一行、读写变量 | 多方法、P/Invoke、复杂控制流 |
| **引用** | Z.Expressions 已注册类型，见 **`expressions`** | 默认 Quicker 脚本引用；**额外 DLL** 须在步骤「引用DLL库」中列出 |
| **线程** | 默认非 UI；慎用 `onUiThread` | `runOnUiThread` 按是否需要 WPF/STA 选择 |
| **可移植性** | 高（与用户机器上的 Quicker 一致） | 中（勿写仅开发版存在的内部 API） |

编写 `sys:csscript` 时：

- 优先 **BCL + 内联 P/Invoke**，不 `using` 未在 `reference` 中声明的程序集。
- **不要**从 Quicker 源码仓库「抄」类名；用户环境未必包含该程序集。
- 编译/运行失败后：改 **runScript** 或简化脚本，而不是猜测更多内部库。

## `sys:runScript` 适用场景

- 读写注册表、调用 `reg` / PowerShell。
- 调用系统自带工具（无需 Quicker 专有 API）。
- 用户已提供可复用的 `.ps1` / `.bat`。

注意：隐藏窗口、编码、是否等待进程结束——参数以 **`step-runner get`** 为准。

## 信息来源（禁止混淆）

| 来源 | 可用于用户动作 | 说明 |
|------|----------------|------|
| `qkrpc guide get` / `step-runner get` / `step-runner search` | **是** | 写动作时唯一默认可假定存在的契约 |
| Quicker 产品源码树 | **仅作实现参考** | 不得把内部类型写进用户动作，除非改回退链路 4/5 的自包含实现 |
| 训练数据中的「可能存在的 API」 | **否** | 须用 **`step-runner get`** 验证参数键名 |

## 示例：切换桌面图标显示

| 做法 | 评价 |
|------|------|
| 专用模块 | `step-runner search` 无匹配 → 不能假设有「桌面图标」模块 |
| `using ManagedShell... ShellHelper` | **差**：依赖开发树中的程序集，用户环境常编译失败 |
| `sys:csscript` + P/Invoke（`FindWindow` / `SendMessage` 命令 `0x7402`） | **好**：自包含 |
| `sys:runScript` 改 `HideIcons` 注册表 + 刷新 Explorer | **可**：可移植，需注意刷新方式 |

## 与用户沟通

回退到 **4–7** 时，向用户说明：

- 采用了哪种回退（表达式 / C# / 脚本）及原因；
- 环境依赖（Win10/11、需非 Shell 模式桌面等）；
- 若运行报错，根据错误改引用或降级为脚本。

## 相关主题

`authoring-workflow` · `overview` · `expressions` · `step-modules` · `patch-workflow` · `variables`
