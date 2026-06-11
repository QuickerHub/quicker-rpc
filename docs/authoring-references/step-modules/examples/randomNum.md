# sys:randomNum

> **来源**：step JSON 示例 · **官方**：[randomnum](https://getquicker.net/KC/Help/Doc/randomnum)

**用途**：生成指定范围内的随机整数。

## 示例

### 1 到 100

```json
{
  "stepRunnerKey": "sys:randomNum",
  "inputParams": {
    "min": "1",
    "max": "100"
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
