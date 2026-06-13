# sys:randomNum

> **分类**：计算与数据结构 · **来源**：仓库手写 · **官方**：[randomnum](https://getquicker.net/KC/Help/Doc/randomnum)

**用途**：生成 `[min, max)` 范围内的随机整数（也可用 `evalexpression` 的 `Random`）。

## 示例

### 1 到 100（含 1 不含 100）

```json
{
  "stepRunnerKey": "sys:randomNum",
  "inputParams": {
    "min": 1,
    "max": 100
  },
  "outputParams": {
    "output": "随机数"
  }
}
```

### 含上下界变量

```json
{
  "stepRunnerKey": "sys:randomNum",
  "inputParams": {
    "min.var": "下限",
    "max.var": "上限"
  },
  "outputParams": {
    "output": "随机数"
  }
}
```

## 陷阱

- 结果为 **`min ≤ output < max`**（max 不包含）；要 1–100 含两端时设 `min: 1, max: 101`。
- 仅整数；浮点随机用 `evalexpression`。

## 相关

evalexpression · repeat · select · step-runner-get
