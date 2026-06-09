# sys:screenCapturePro

> **来源**：step JSON 示例 · **官方**：[screencapturepro](https://getquicker.net/KC/Help/Doc/screencapturepro)

**用途**：交互式区域截图（Pro 版，支持多屏与延迟；本机 `step-runner get` 可能不可用，键名以设计器为准）。

## 示例

### 选择区域截图

```json
{
  "stepRunnerKey": "sys:screenCapturePro",
  "inputParams": {
    "type": "select",
    "delay": "300"
  },
  "outputParams": {
    "isSuccess": "成功",
    "img": "截图",
    "rect": "区域"
  }
}
```

### 指定显示器

```json
{
  "stepRunnerKey": "sys:screenCapturePro",
  "inputParams": {
    "type": "primary_screen",
    "monitorIndex": "0",
    "delay": "500"
  },
  "outputParams": {
    "img": "截图"
  }
}
```

### 固定区域

```json
{
  "stepRunnerKey": "sys:screenCapturePro",
  "inputParams": {
    "type": "fixed_area",
    "area": "100,100,500,400",
    "toClip": "1"
  },
  "outputParams": {
    "img": "截图",
    "rect": "区域"
  }
}
```
