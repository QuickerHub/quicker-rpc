# sys:playRecords

> **来源**：step JSON 示例 · **官方**：[playrecord](https://getquicker.net/KC/Help/Doc/playrecord)

**用途**：重放键鼠录制数据。

## 示例

### 原速重放

```json
{
  "stepRunnerKey": "sys:playRecords",
  "inputParams": {
    "data.var": "录制数据"
  }
}
```

### 加速重放

```json
{
  "stepRunnerKey": "sys:playRecords",
  "inputParams": {
    "data.file": "files/record.txt",
    "speed": "1.5"
  }
}
```
