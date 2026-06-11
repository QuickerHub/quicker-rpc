# sys:stringProcess

> **分类**：文本处理 · **来源**：仓库手写 · **官方**：[stringprocess](https://getquicker.net/KC/Help/Doc/stringprocess)

**用途**：内置单行/多行文本变换（大小写、截取、编码、哈希等）。

**勿用于**：逻辑判断、LINQ、赋值 — 用 **`expressions`** / **`sys:evalexpression`**。

**何时读**：`get` 定「处理」类型后；仅截取/插入/移除/编码等需额外参数的模式扫 wire。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 处理 | `controlField` | 各选项参数集不同 — 以 get 为准 |
| 待处理内容 | inline / `.var` | |
| 截取/插入/移除 | 开始位置 + 长度/内容 | 位置 0 起；负数从尾计数 |
| 格式化 JSON | 输入须合法 JSON | |

## 模式（优先 expressions 的场景）

| 需求 | 更优 |
|------|------|
| 拼接、条件、正则替换 | `expressions` |
| URL/Html/Base64 单步 | 本模块或 expressions |
| MD5/SHA 文本 | 本模块；**文件**哈希 → `checkPathExists` |

## 禁止 / 常见错误

| 写法 | 问题 |
|------|------|
| 用本模块做 if/循环 | 应用分支步或 csscript |
| 截取长度 0 | 表示到末尾（见 get purpose） |

## 示例

<!-- QuickerModuleDoc examples -->

### 将剪贴板字符串首字母大写后写入剪贴板，并提示“over”

```json
{
  "stepRunnerKey": "sys:stringProcess",
  "inputParams": {
    "data.var": "[cliptext]"
  },
  "outputParams": {
    "output": "output"
  }
}
```
## 相关

expressions · step-runner-get · implementation-fallback · enc
