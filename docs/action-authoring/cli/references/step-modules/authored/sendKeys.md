# sys:sendKeys

> **分类**：自动化 · **来源**：仓库手写 · **官方**：[sendkeys](https://getquicker.net/KC/Help/Doc/sendkeys)

**用途**：向活动窗口发送 SendKeys 格式按键/文本。

## 示例

### 发送文本

```json
{
  "stepRunnerKey": "sys:sendKeys",
  "inputParams": {
    "keys": "hello world"
  }
}
```

### 快捷键 Ctrl+C

```json
{
  "stepRunnerKey": "sys:sendKeys",
  "inputParams": {
    "keys": "^c"
  }
}
```

### 插值动态内容

```json
{
  "stepRunnerKey": "sys:sendKeys",
  "inputParams": {
    "keys.var": "按键序列"
  }
}
```

## 陷阱

- C# `SendKeys.Send` 语法：`^` Ctrl、`+` Shift、`%` Alt、`{TAB}` 特殊键；无输出参数。
- 需目标窗口有焦点；复杂按键/游戏场景用 `keyInput` 或 `mouse`；与 `sys:sendKeys`（无 B）区分模块名。

## 相关

keyInput · mouse · activateProcessMainWindow · step-runner-get
