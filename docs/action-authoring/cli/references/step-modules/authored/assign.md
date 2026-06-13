# sys:assign

> **分类**：计算与数据结构 · **来源**：仓库手写 · **官方**：[assign](https://getquicker.net/KC/Help/Doc/assign)

**用途**：为变量赋值（已废弃；新步骤优先 `sys:evalexpression` 的 `{var}=` 写法）。

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

- 新动作勿新增 assign 步骤；等价逻辑用 `sys:evalexpression`（见 `expressions` topic）。
- 目标变量为列表/词典时赋值会**创建副本**；从另一变量复制用 `input.var`，勿指望原地共享引用。

## 相关

expressions · evalexpression · step-runner-get · implementation-fallback
