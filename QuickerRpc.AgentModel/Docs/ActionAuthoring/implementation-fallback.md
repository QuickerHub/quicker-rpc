# 实现方式与回退链路

**何时阅读**：`step-modules` / `step-runner search` **找不到**合适模块；或需求是「计算 / 判断 / 拼装逻辑」而非固定 UI 操作。**必须**按本文选型，**禁止**假设存在仅在内置程序集里的类型（如 `ManagedShell.*`、`ShellHelper` 等），除非 **`step-runner get`** 的 schema 或用户明确提供引用。

## C# 优先于 PowerShell（硬约束）

无专用模块时，**默认用 `sys:csscript`（C#）**，不要用 `sys:runScript`（PowerShell/CMD）代替「能写清楚的逻辑」。

| 优先 | 模块 | 说明 |
|------|------|------|
| **首选** | `sys:csscript` | 注册表、文件/路径、JSON、Win32/P/Invoke、多步算法、错误处理、读写变量 — 与 Quicker 集成好、可维护 |
| **仅极简单** | `sys:runScript` | 单行/极短：如 `reg query …`、`hostname`、用户已给的 `.ps1`；**不要**用 PS 实现本可用 C# 完成的业务逻辑 |
| **外部程序** | `sys:run` | 官方 CLI、已有 exe，且不必把逻辑嵌进动作 |

**反模式**：为「没有专用模块」直接写一长段 PowerShell；应改为 C#（BCL + 必要时内联 P/Invoke）。

## 总体优先级（先权衡，再搜模块）

在盲目 **`step-runner search`** 之前，按下面顺序判断能否用**更少步骤、更可移植**的方式完成：

| 优先级 | 手段 | `stepRunnerKey` / 写法 | 适用 |
|--------|------|------------------------|------|
| **1** | 参数内表达式 | `$=` / `$$` / `{varKey}` | 单步内的条件、拼接、简单运算；见 **`expressions`** |
| **2** | 执行表达式步骤 | `sys:evalexpression` | 多行赋值、列表/字符串处理、分支前准备变量 |
| **3** | 专用步骤模块 | `step-modules` → **`step-runner get`** | 剪贴板、HTTP、文件、弹窗等有官方模块的能力 |
| **4** | 运行 C# 代码 | `sys:csscript` | 无专用模块时的**默认**实现；Win32、注册表、自定义算法；代码应**自包含**或仅用 Quicker 文档允许的引用 |
| **5** | 运行脚本 | `sys:runScript`（PS/CMD 等） | **仅**极短系统命令/注册表查询、或用户提供的脚本；**非**通用业务逻辑载体 |
| **6** | 运行/打开 | `sys:run` | 调用外部 exe、官方 CLI |
| **7** | 脆弱兜底 | 模拟按键、菜单自动化等 | 仅在前述均不可行时；须在说明中标注环境依赖 |

**原则**：能用 **1–2** 解决的，不要堆多个专用步骤；能用 **3** 的，不要写 **4**；需要 **4** 时**优先 C#**，**不要**为省事默认 PowerShell；**4** 不要引用用户环境未必存在的内部 DLL。

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
  → 逻辑能否拆成 expressions / sys:evalexpression？
       能 → 优先表达式，少建步骤
       否 ↓
  → sys:csscript（BCL、Registry、P/Invoke；reference 仅列用户提供的 DLL）
       失败 → 缩小范围、简化代码；勿猜内部库
       仍失败且仅为「一行系统命令」？
            是 → sys:runScript 或 sys:run
            否 → notify 说明限制 / 请用户确认环境
```

## `sys:evalexpression` 与 `sys:csscript` 的分工

| | `sys:evalexpression` | `sys:csscript` |
|--|---------------------|----------------|
| **适合** | `{a}={b}+1`、LINQ 一行、读写变量 | 多方法、P/Invoke、注册表/文件 IO、复杂控制流 |
| **引用** | Z.Expressions 已注册类型，见 **`expressions`** | 默认 Quicker 脚本引用；**额外 DLL** 须在步骤「引用DLL库」中列出 |
| **线程** | 默认非 UI；慎用 `onUiThread` | `runOnUiThread` 按是否需要 WPF/STA 选择 |
| **可移植性** | 高（与用户机器上的 Quicker 一致） | 中（勿写仅开发版存在的内部 API） |

编写 `sys:csscript` 时：

- 优先 **BCL + 内联 P/Invoke**（含 `Microsoft.Win32.Registry` 等），不 `using` 未在 `reference` 中声明的程序集。
- **不要**从 Quicker 源码仓库「抄」类名；用户环境未必包含该程序集。
- 编译/运行失败后：**先简化 C# 或拆成 `sys:evalexpression`**；仅当任务确实是「一行 reg/cmdlet」时再考虑 **`sys:runScript`**，而不是猜测更多内部库或默认加长 PowerShell。

## `sys:runScript` 适用场景（收窄）

**仅当**满足下列之一时使用：

- 用户已提供可复用的 `.ps1` / `.bat`，且明确要求沿用。
- 调用**单行**系统工具，用 C# 写反而更啰嗦（如 `reg query`、`ipconfig`、固定参数的 `powershell -Command "..."`）。
- 团队规范明确要求必须用某条现成 PS 命令（需在说明中写明）。

**不要用 `sys:runScript` 做**：

- 多步业务逻辑、循环、错误处理、解析 JSON/路径（改用 **`sys:csscript`**）。
- 读写注册表、文件、环境变量等（C# `Registry` / `File` / `Environment` 更清晰）。
- 「没有专用模块」时的默认实现 — 那是 **`sys:csscript`** 的职责。

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
| `sys:csscript` + P/Invoke（`FindWindow` / `SendMessage` 命令 `0x7402`） | **好**：自包含，首选 |
| `sys:csscript` + `Registry` 读写 + 刷新 Explorer | **好**：逻辑集中、易维护 |
| `sys:runScript` 改 `HideIcons` 注册表 + 刷新 Explorer | **可**：仅当坚持最短 PS 一行式；复杂刷新仍应用 C# |

## 与用户沟通

回退到 **4–7** 时，向用户说明：

- 采用了哪种回退（表达式 / **C#** / 脚本 / 外部程序）及原因；
- 若用 **`sys:runScript`**，说明为何未用 C#（极简单 / 用户脚本）；
- 环境依赖（Win10/11、需非 Shell 模式桌面等）；
- 若运行报错，C# 步骤优先改引用或简化代码，**不要**未经尝试就整段换成 PowerShell。

## 相关主题

`authoring-workflow` · `overview` · `expressions` · `step-modules` · `patch-workflow` · `variables`
