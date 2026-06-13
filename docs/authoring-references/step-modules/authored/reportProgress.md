# sys:reportProgress

> **分类**：界面交互 · **来源**：仓库手写 · **官方**：[reportprogress](https://getquicker.net/KC/Help/Doc/reportprogress)

**用途**：创建、更新与关闭 Quicker 浮动进度条（长任务反馈）。

## 示例

### 申请进度条 ID

```json
{
  "stepRunnerKey": "sys:reportProgress",
  "inputParams": {
    "type": "REQUEST_ID",
    "title": "处理中…"
  },
  "outputParams": {
    "progressId": "进度ID"
  }
}
```

### 更新进度

```json
{
  "stepRunnerKey": "sys:reportProgress",
  "inputParams": {
    "type": "UPDATE_PROGRESS",
    "progressId.var": "进度ID",
    "percentage.var": "百分比",
    "text.var": "状态文本"
  }
}
```

### 移除进度条

```json
{
  "stepRunnerKey": "sys:reportProgress",
  "inputParams": {
    "type": "REMOVE",
    "progressId.var": "进度ID"
  }
}
```

## 陷阱

- 典型三步：`REQUEST_ID`（得 `progressId`）→ 循环内 `UPDATE_PROGRESS`（`percentage` 0–100）→ `REMOVE`。
- `each`/`repeat` 也可设 `progressBarTitle` 内置进度；本模块适合自定义百分比与说明文字。

## 相关

each · repeat · notify · showWaitWin · step-runner-get
