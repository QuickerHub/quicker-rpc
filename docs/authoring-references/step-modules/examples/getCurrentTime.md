# sys:getCurrentTime

> **来源**：step JSON 示例 · **官方**：[gettime](https://getquicker.net/KC/Help/Doc/gettime)

**用途**：获取、解析或换算日期时间（含 Unix 时间戳）。

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
