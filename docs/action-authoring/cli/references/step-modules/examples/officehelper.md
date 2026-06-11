# sys:officehelper

> **来源**：step JSON 示例 · **官方**：[officehelper](https://getquicker.net/KC/Help/Doc/officehelper)

**用途**：对前台 Office/WPS 实例执行 VBA 或格式命令。

## 示例

### 执行 Excel VBA

```json
{
  "stepRunnerKey": "sys:officehelper",
  "inputParams": {
    "operation": "execVBA",
    "appType": "excel",
    "code": "Sub Main()\n  ActiveSheet.Range(\"A1\").Value = \"OK\"\nEnd Sub"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 调用已存在宏

```json
{
  "stepRunnerKey": "sys:officehelper",
  "inputParams": {
    "operation": "execVBA",
    "appType": "word",
    "code": "MyMacro"
  },
  "outputParams": {
    "isSuccess": "成功",
    "resp": "返回值"
  }
}
```

### 获取 ProgId

```json
{
  "stepRunnerKey": "sys:officehelper",
  "inputParams": {
    "operation": "getProgId",
    "appType": "excel"
  },
  "outputParams": {
    "isSuccess": "成功",
    "progId": "ProgId"
  }
}
```
