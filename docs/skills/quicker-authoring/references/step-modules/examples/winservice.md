# sys:winservice

> **来源**：step JSON 示例 · **官方**：[winservice](https://getquicker.net/KC/Help/Doc/winservice)

**用途**：查询 Windows 服务信息或注册表值。

## 示例

### 查询服务状态

```json
{
  "stepRunnerKey": "sys:winservice",
  "inputParams": {
    "operation": "getServiceInfo",
    "name": "Spooler"
  },
  "outputParams": {
    "isExists": "存在",
    "displayName": "显示名",
    "state": "状态"
  }
}
```

### 列出服务

```json
{
  "stepRunnerKey": "sys:winservice",
  "inputParams": {
    "operation": "getServiceList"
  },
  "outputParams": {
    "serviceList": "服务列表"
  }
}
```

### 读取注册表值

```json
{
  "stepRunnerKey": "sys:winservice",
  "inputParams": {
    "operation": "getRegValue",
    "regKeyPath": "HKEY_LOCAL_MACHINE\\SOFTWARE\\Example",
    "regValueName": "InstallPath"
  },
  "outputParams": {
    "regValue": "注册表值"
  }
}
```
