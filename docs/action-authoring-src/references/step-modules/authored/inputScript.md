# sys:inputScript

> **分类**：常用基础 · **来源**：仓库手写（`references/step-modules/authored/`）· **官方**：[inputscript](https://getquicker.net/KC/Help/Doc/inputscript)

**用途**：多步骤输入 — 用行式脚本串行模拟键盘、快捷键、粘贴与鼠标操作（Quicker 模块名「多步骤输入」）。

**何时读**：`step_runner_get` 定好 `data` / `stopIfFail` 后；写连续键入、热键、粘贴、短延迟自动化时优先本模块，而非 `sys:csscript`。

## data.json wire

| param | wire | notes |
|-------|------|-------|
| `data` | inline string or `data.file` | 步骤脚本正文；**不是** `$=` / `$$` 表达式 |
| `data.var` | variable key | 运行时从变量取脚本 |
| `stopIfFail` | literal / `stopIfFail.var` | 失败后是否停止动作 |

```json
{
  "stepRunnerKey": "sys:inputScript",
  "inputParams": {
    "data": "delay:200\npaste:hello\nhotkey:Ctrl+S",
    "stopIfFail": "true"
  },
  "outputParams": {
    "isSuccess": "ok"
  }
}
```

长脚本（>4 行）→ `"data.file": "files/steps.txt"`（action-project-files）。

**禁止**：把 `data` 写成 `$=…` 或 `$$…`；花括号 `{LEFT 2}` 仅在 **sendkeys** 参数内表示 SendKeys 语法，**不是**动作变量占位符。

## 脚本语法（多步骤 DSL）

| 规则 | 说明 |
|------|------|
| 一行一令 | 默认每行一条 `命令:参数` |
| 注释 | `//` 开头整行忽略 |
| 同行多条 | `;;` 分隔（1.36.17+），如 `delay:10;;input:hi` |
| 命令名 | 英文，大小写不敏感 |
| 参数 | 冒号后原样传入；**sendkeys** 内 `{LEFT 2}` 等为按键语法，勿与 `variables[]` 混淆 |

典型流程：`delay` → `paste` / `input` → `hotkey` / `sendkeys`；需按住修饰键时用 `keydown`…`keyup` 配对。

## 命令速查

### 键盘

| 命令 | 参数示例 | 说明 |
|------|----------|------|
| `input` | `hello world` | 纯文本键入（不受输入法影响） |
| `input2` | `\t行1\r\n行2` | 支持 `\t` `\r\n` 等转义（1.30.0+） |
| `sendkeys` | `{LEFT 2}`、`{ENTER}` | SendKeys B 语法；`{…}` 是按键 token，非变量 |
| `delay` | `1000` | 等待毫秒（非负整数） |
| `paste` | `hello world` | 写入剪贴板后 Ctrl+V |
| `keydown` / `keyup` / `keypress` | `F1`、`#175` | 按键名或 `#`+虚拟键码；**keydown 须后续 keyup** |
| `hotkey` | `Ctrl+S`、`Ctrl+Alt+D1` | `+` 连接；数字键用 `D1`…`D9` |

### 鼠标（1.28.16+）

| 命令 | 参数示例 | 说明 |
|------|----------|------|
| `moveto` | `100,200` / `50%,50%` | 绝对坐标或百分比 |
| `move` | `10,-10` | 相对位移 `dx,dy` |
| `click` / `dbclick` | `left` | `left` `right` `middle` `x1` `x2` |
| `down` / `up` | `left` | 按下/抬起；**须配对** |
| `wheel` / `wheeldelta` / `hwheel` / `hwheeldelta` | `3` / `-120` | 滚动量（整数） |

### 剪贴板文件/图片（1.28.12+）

| 命令 | 参数示例 | 说明 |
|------|----------|------|
| `pastefile` | `d:\a.png;d:\b.txt` | 文件路径；多文件 `;` 分隔 |
| `pasteimage` | `d:\a.png` | 单图片路径（剪贴板为图片对象） |

注意：运行中不支持逐步停止，不宜塞入过多步骤。

## 示例

**合法**：

```text
// open and save
delay:300
paste:draft.txt
hotkey:Ctrl+S
sendkeys:{HOME}{SHIFT down}{END}{SHIFT up}
keydown:F1
delay:50
keyup:F1
```

**常见错误**：

| 写法 | 问题 |
|------|------|
| `wait 1000` | 缺 `命令:` 格式 |
| `delay:1s` | delay 须整数毫秒 |
| `keyup:F1`（无 keydown） | keyup 须与 keydown 配对 |
| `hotkey:Ctrl++S` | `+` 之间不能为空 |

## 语法检查（本模块）

`patch` 后可选 `project.diagnostics.get`；仅检查 **`sys:inputScript` 的 `data` / `data.file`**（`data.var` 绑定跳过）。issue `kind` 为 `inputScript`，`location` 指向 `inputParams.data`，外链脚本带**行号**。

| code | 级别 | 含义 |
|------|------|------|
| `INPUT_SCRIPT_INVALID_LINE` | Error | 非 `//` 注释行不是 `命令:参数` |
| `INPUT_SCRIPT_UNKNOWN_COMMAND` | Warning | 命令名不在上文速查表 |
| `INPUT_SCRIPT_EMPTY_PARAM` | Error | 必须有参数的命令缺参（如 `delay:`） |
| `INPUT_SCRIPT_INVALID_PARAM` | Error | 参数格式不符（如 `delay:abc`、`click:foo`、`hotkey:Ctrl++S`） |
| `INPUT_SCRIPT_UNMATCHED_KEYUP` | Error | `keyup` 无对应 `keydown` |
| `INPUT_SCRIPT_UNMATCHED_KEYDOWN` | Warning | 脚本结束仍有键未 `keyup` |
| `INPUT_SCRIPT_UNMATCHED_MOUSE_UP` | Error | `up` 无对应 `down` |
| `INPUT_SCRIPT_UNMATCHED_MOUSE_DOWN` | Warning | 脚本结束仍有鼠标键未 `up` |
| `INPUT_SCRIPT_MISSING_DATA` | Warning | 步骤无脚本内容 |

不检查：SendKeys 在本机是否有效、运行时 `data.var` 展开后的正文。

## Agent 流程

1. `step_runner_get` → 确认 `data`、`stopIfFail`、`isSuccess`
2. 写 `inputParams.data` 或 `data.file`
3. `patch` 保存；脚本存疑时看 diagnostics 中上表 `INPUT_SCRIPT_*`
4. 勿把 sendkeys 花括号当成 `variables[]` 插值

## 相关

step-runner-get · action-project-files · workspace-editing · expressions（变量/表达式与本脚本 DSL 无关）
