# sys:audioControl

> **分类**：系统与窗口 · **来源**：仓库手写 · **官方**：[audiocontrol](https://getquicker.net/KC/Help/Doc/audiocontrol)

**用途**：枚举/查询音频输入输出设备，设置默认设备、静音与音量（NAudio MMDevice）。

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

## 陷阱

- `deviceList` 每项格式为 `[图标]名称|设备ID`，可直接作为 `sys:select` 的选项来源；后续操作用 `id` / `id.var` 引用设备 ID。
- `SetDeviceVolume` 的 `volume` 为 0–1.0 小数；`SetDeviceMute` 的 `mute` 取 `true` / `false` / `toggle` 字符串。
- `returnAll: true` 才包含非 Active 状态设备；默认仅返回就绪设备。

## 相关

select · step-runner-get · getSysInfo · implementation-fallback
