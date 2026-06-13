# sys:compute

> **分类**：计算与数据结构 · **来源**：仓库手写 · **官方**：[compute](https://getquicker.net/KC/Help/Doc/compute)

**用途**：计算表达式（已废弃；新步骤优先 `sys:evalexpression`）。

## 示例

### 简单算术

```json
{
  "stepRunnerKey": "sys:compute",
  "inputParams": {
    "expression": "3*5+20"
  },
  "outputParams": {
    "isSuccess": "成功",
    "output": "结果"
  }
}
```

### 插值与比较

```json
{
  "stepRunnerKey": "sys:compute",
  "inputParams": {
    "expression": "$$ {数量} > 5 and {数量} < 100"
  },
  "outputParams": {
    "isSuccess": "成功",
    "output": "是否满足"
  }
}
```

## 陷阱

- 新动作勿新增本步；等价写法见 **quicker-eval-expression** / `evalexpression`。
- `evalVar: true` 启用 Math 等增强；输出键 `output`（Boolean/数值/文本视表达式而定）。

## 相关

evalexpression · assign · simpleIf · step-runner-get
