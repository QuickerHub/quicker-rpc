# sys:manageList

> **分类**：计算与数据结构 · **来源**：仓库手写 · **官方**：[managelist](https://getquicker.net/KC/Help/Doc/managelist)

**用途**：弹出 UI 让用户手工排序、增删改列表项（结果写回原 `list.var`）。

## 示例

### 管理文本列表

```json
{
  "stepRunnerKey": "sys:manageList",
  "inputParams": {
    "list.var": "任务列表",
    "winTitle": "编辑任务",
    "allowAdd": true,
    "allowEdit": true,
    "allowDelete": true
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 只读查看

```json
{
  "stepRunnerKey": "sys:manageList",
  "inputParams": {
    "list.var": "日志列表",
    "winTitle": "查看记录",
    "allowAdd": false,
    "allowEdit": false,
    "allowDelete": false
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

## 陷阱

- **交互式**步骤；`list` 须直接选变量（`list.var`），勿用表达式；确认后列表原地更新。
- `parseData: true` 时项格式 `[图标]标题(tooltip)|值`，分隔符默认 `|`（参数名 wire 为 `seperator`）。
- 用户取消时 `isSuccess: false`；`stopIfFail: true` 则中止动作。

## 相关

select · showmenu · listOperations · form · step-runner-get
