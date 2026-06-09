# sys:sendKeys

> **来源**：step JSON 示例 · **官方**：[sendkeys](https://getquicker.net/KC/Help/Doc/sendkeys)

**用途**：向活动窗口发送 SendKeys 格式的按键序列。

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

### 特殊键与组合

```json
{
  "stepRunnerKey": "sys:sendKeys",
  "inputParams": {
    "keys": "^+{TAB}"
  }
}
```
