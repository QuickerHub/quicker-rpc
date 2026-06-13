# sys:getCurrentTime

> **分类**：计算与数据结构 · **来源**：仓库手写 · **官方**：[gettime](https://getquicker.net/KC/Help/Doc/gettime)

**用途**：获取当前时间、从文本/Unix 戳解析、偏移后输出 DateTime 与格式化文本。

## 示例

### 当前时间格式化

```json
{
  "stepRunnerKey": "sys:getCurrentTime",
  "inputParams": {
    "format": "yyyy-MM-dd"
  },
  "outputParams": {
    "isSuccess": "成功",
    "strValue": "日期文本",
    "output": "时间对象"
  }
}
```

### 从文本解析时间

```json
{
  "stepRunnerKey": "sys:getCurrentTime",
  "inputParams": {
    "source": "fromString",
    "timeStr.var": "时间文本",
    "inputFormat": "yyyy/MM/dd"
  },
  "outputParams": {
    "isSuccess": "成功",
    "timeStamp": "秒级时间戳"
  }
}
```

### Unix 毫秒戳转换

```json
{
  "stepRunnerKey": "sys:getCurrentTime",
  "inputParams": {
    "source": "Source_UnixTimeStampMs",
    "timeStampStr.var": "毫秒戳"
  },
  "outputParams": {
    "isSuccess": "成功",
    "output": "时间对象"
  }
}
```

## 陷阱

- `source` 分支互斥：`currTime` / `fromString` + `inputFormat` / `fromUnixTimeStamp`（秒）/ `Source_UnixTimeStampMs` / `fromVar` + `timeVar`。
- `format` 为 C# `DateTime.ToString` 格式；`addMonths` 不跨月溢出；`useUtc` 影响 Unix 解释与时区。
- 时间差/偏移也可用 `computeTime`；复杂逻辑用 `evalexpression`。

## 相关

computeTime · evalexpression · getSysInfo · step-runner-get
