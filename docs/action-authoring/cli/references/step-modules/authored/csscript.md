# sys:csscript
<!-- qkrpc-search-aliases: C#脚本, csharp脚本 -->

> **分类**：脚本与代码 · **来源**：仓库手写 · **官方**：[csscript](https://getquicker.net/KC/Help/Doc/csscript)

**用途**：执行 C# 脚本（`Exec`），复杂逻辑兜底。

**勿用于**：简单表达式/赋值 — **`expressions`** / **`sys:evalexpression`**。

**何时读**：`get` 定运行模式后；写 `Exec` 签名、外链 `.cs`、引用 DLL 前读。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 脚本内容 | inline / `脚本内容.file` → `files/*.cs` | 长脚本外链；**勿**用插值拼整段代码（破坏程序集缓存） |
| 引用DLL库 | 多行完整路径 | `//css_reference` 或参数区每行一个 |
| 执行线程 | 自动/UI/MTA/STA | COM/Office 用 v2 + 合适 STA；UI 线程忌阻塞 |
| 运行模式 | 普通 v1/v2、低权限 v1/v2 | **Exec 签名不同，禁止混用** |

## 协议（Exec 签名）

**普通模式**（Quicker 进程）：

```csharp
public static void Exec(Quicker.Public.IStepContext context) {
  var v = context.GetVarValue("varName");
  context.SetVarValue("varName", "out");
}
```

可改返回值类型 → 绑定「返回内容」输出。

**低权限模式**（LPAgent 进程，无 context）：

```csharp
public static string Exec(string paramValue) { return "out"; }
```

「参数值」→ `paramValue`；「等待返回」控制是否取返回值。

## 禁止 / 常见错误

| 写法 | 问题 |
|------|------|
| 普通/低权限 Exec 混用 | 编译或运行失败 |
| `$=${var}` 拼脚本体 | 每次变体重新编译 |
| Office Interop 用 v1 | 改 v2 模式 |

## 示例

```json
{
  "stepRunnerKey": "sys:csscript",
  "inputParams": {
    "脚本内容.file": "files/handler.cs"
  },
  "outputParams": {
    "返回内容": "result"
  }
}
```

patch 后可用 `project.diagnostics.get` 看 `COMPILE_ERROR`（Roslyn）。

## 相关

expressions · action-project-files · step-runner-get · implementation-fallback
