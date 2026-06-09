# sys:audioControl

> **来源**：step JSON 示例 · **官方**：[audiocontrol](https://getquicker.net/KC/Help/Doc/audiocontrol)

**用途**：获取音频设备列表/信息，设置默认设备、静音与音量。

## 示例

### 获取输出设备列表

```json
{
  "stepRunnerKey": "sys:audioControl",
  "inputParams": {
    "operation": "GetOutputDeviceList"
  },
  "outputParams": {
    "isSuccess": "成功",
    "deviceList": "设备列表"
  }
}
```

### 获取默认输出设备

```json
{
  "stepRunnerKey": "sys:audioControl",
  "inputParams": {
    "operation": "GetOutputDefaultDevice"
  },
  "outputParams": {
    "isSuccess": "成功",
    "deviceId": "设备ID",
    "deviceName": "设备名",
    "volume": "音量"
  }
}
```

### 切换默认输出设备

```json
{
  "stepRunnerKey": "sys:audioControl",
  "inputParams": {
    "operation": "SetDefaultDeviceById",
    "id.var": "选中设备ID"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 设置音量

```json
{
  "stepRunnerKey": "sys:audioControl",
  "inputParams": {
    "operation": "SetDeviceVolume",
    "id.var": "设备ID",
    "volume": 0.5
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```
