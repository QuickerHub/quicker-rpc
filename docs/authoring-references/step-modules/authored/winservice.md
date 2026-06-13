# sys:winservice

> **分类**：系统 · **来源**：仓库手写 · **官方**：[winservice](https://getquicker.net/KC/Help/Doc/winservice)

**用途**：查询 Windows 服务状态/列表，或读取注册表值。

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
    "isExists": "存在",
    "regValue": "注册表值"
  }
}
```

## 陷阱

- `name` 为服务**内部名**（非 displayName），大小写敏感；`state` 4=运行中、1=已停止等。
- `regValueName` 留空读默认值；只读不写，修改注册表用 `evalexpression`/脚本。
- 写步骤前 `get --control-field getServiceInfo` 等。

## 相关

run · checkProcessExists · evalexpression · step-runner-get
