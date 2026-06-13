# sys:computeTime

> **分类**：计算与数据结构 · **来源**：仓库手写 · **官方**：[computetime](https://getquicker.net/KC/Help/Doc/computetime)

**用途**：DateTime 取整、间隔、偏移与 UTC/本地互转（简单日期算术也可用 `sys:evalexpression`）。

## 示例

### 取当天 0 点

```json
{
  "stepRunnerKey": "sys:computeTime",
  "inputParams": {
    "type": "getdate",
    "time1.var": "现在"
  },
  "outputParams": {
    "isSuccess": "成功",
    "resultTime": "日期零点"
  }
}
```

### 计算两时间差

```json
{
  "stepRunnerKey": "sys:computeTime",
  "inputParams": {
    "type": "timespan",
    "time1.var": "开始时间",
    "time2.var": "结束时间",
    "formatString": "d\\.hh\\:mm\\:ss"
  },
  "outputParams": {
    "isSuccess": "成功",
    "totalDays": "天数",
    "textValue": "间隔文本"
  }
}
```

### 偏移 N 天

```json
{
  "stepRunnerKey": "sys:computeTime",
  "inputParams": {
    "type": "endtime",
    "time1.var": "基准时间",
    "addDays": 7
  },
  "outputParams": {
    "isSuccess": "成功",
    "resultTime": "一周后"
  }
}
```

### UTC 转本地

```json
{
  "stepRunnerKey": "sys:computeTime",
  "inputParams": {
    "type": "utcToLocal",
    "time1.var": "UTC时间"
  },
  "outputParams": {
    "isSuccess": "成功",
    "resultTime": "本地时间"
  }
}
```

## 陷阱

- `timespan` 的 `formatString` 中 `:` 须 `\\:` 转义（默认 `d\\.hh\\:mm\\:ss`）；同时可绑定 `totalDays/Hours/Minutes/Seconds` 数值输出。
- `endtime` 的 `addMonths` 不跨月溢出（如 1 月 31 日 +1 月 → 2 月 28/29 日）；小数可用于 `addDays/addHours` 等。
- 获取当前时间用 `sys:getCurrentTime`；复杂 LINQ 日期逻辑优先 `sys:evalexpression`。

## 相关

getCurrentTime · evalexpression · compute · step-runner-get
