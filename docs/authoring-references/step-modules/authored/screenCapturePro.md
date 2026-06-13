# sys:screenCapturePro

> **分类**：图像 · **来源**：仓库手写 · **官方**：[screencapturepro](https://getquicker.net/KC/Help/Doc/screencapturepro)

**用途**：Pro 版区域截图（多屏、延迟等；本机 `step-runner get` 可能报 No StepRunner，键名以设计器为准）。

## 示例

### 选择区域截图

```json
{
  "stepRunnerKey": "sys:screenCapturePro",
  "inputParams": {
    "type": "select",
    "delay": 300
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
    "delay": 500
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
    "toClip": true
  },
  "outputParams": {
    "img": "截图",
    "rect": "区域"
  }
}
```

## 陷阱

- 与 `screenCapture` 类似但支持 `monitorIndex` 等多屏选项；无 get schema 时对照设计器与本 ref。
- `select` 需用户交互，自动化测试跳过。

## 相关

screenCapture · imageOperations · step-runner-get
