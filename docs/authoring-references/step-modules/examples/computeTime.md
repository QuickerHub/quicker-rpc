# sys:computeTime

> **来源**：step JSON 示例 · **官方**：[computetime](https://getquicker.net/KC/Help/Doc/computetime)

**用途**：日期时间取整、差值、偏移与 UTC 转换。

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
