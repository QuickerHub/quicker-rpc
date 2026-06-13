# sys:textSelectTools

> **分类**：用户交互 · **来源**：仓库手写 · **官方**：[textselecttools](https://getquicker.net/KC/Help/Doc/textselecttools)

**用途**：设计器/文本编辑场景下的交互式选取工具（文件、坐标、键名、动作 ID 等）。

## 示例

### 选择单个文件

```json
{
  "stepRunnerKey": "sys:textSelectTools",
  "inputParams": {
    "operation": "SelectSingleFile",
    "currValue.var": "当前文本"
  },
  "outputParams": {
    "isSuccess": "成功",
    "output": "结果"
  }
}
```

### 选取屏幕区域

```json
{
  "stepRunnerKey": "sys:textSelectTools",
  "inputParams": {
    "operation": "SelectLocationArea"
  },
  "outputParams": {
    "isSuccess": "成功",
    "output": "left,top,right,bottom"
  }
}
```

### 选取动作 ID

```json
{
  "stepRunnerKey": "sys:textSelectTools",
  "inputParams": {
    "operation": "SelectActionId"
  },
  "outputParams": {
    "output": "动作ID"
  }
}
```

## 陷阱

- `operation` 枚举 20+ 种（文件/文件夹/进程/窗口/坐标/键码/图标/动作/CSS 选择器等）；结果统一在 `output` 文本。
- 主要用于动作设计器辅助，headless 自动化多用对应专用模块（`selectFile`、`mouse` 等）；`liveRun: false`。
- 写步骤前 `get --control-field SelectSingleFile` 等。

## 相关

selectFile · select · mouse · step-runner-get
