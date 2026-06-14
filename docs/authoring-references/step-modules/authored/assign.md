# sys:assign

> **分类**：计算与数据结构 · **来源**：仓库手写 · **官方**：[assign](https://getquicker.net/KC/Help/Doc/assign)

**用途**：为动作变量赋值（默认选型）。支持字面量、`$$` 插值、`$=` 表达式，或 `input.var` 复制另一变量。批量多变量或 LINQ 等复杂逻辑再用 `sys:evalexpression`。

## 示例

### 文本插值赋值

```json
{
  "stepRunnerKey": "sys:assign",
  "inputParams": {
    "input": "$$Hello, {用户名}!"
  },
  "outputParams": {
    "output": "问候语"
  }
}
```

### 复制列表变量

```json
{
  "stepRunnerKey": "sys:assign",
  "inputParams": {
    "input.var": "源列表"
  },
  "outputParams": {
    "output": "列表副本"
  }
}
```

### 表达式赋值（文本非空）

```json
{
  "stepRunnerKey": "sys:assign",
  "inputParams": {
    "input": "$=!String.IsNullOrWhiteSpace({文本})"
  },
  "outputParams": {
    "output": "非空"
  }
}
```

## 陷阱

- 单变量写入优先 **assign**；一步写多个变量或共享中间结果时用 **evalexpression** `{a}=…; {b}=…`（见 `expressions` topic）。
- 目标变量为列表/词典时赋值会**创建副本**；从另一变量复制用 `input.var`，勿指望原地共享引用。

## 相关

expressions · evalexpression · step-runner-get · implementation-fallback
