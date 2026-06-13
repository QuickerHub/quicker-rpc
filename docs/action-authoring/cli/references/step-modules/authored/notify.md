# sys:notify

> **分类**：常用基础 · **来源**：仓库手写 · **官方**：[notify](https://getquicker.net/KC/Help/Doc/notify)

**用途**：显示自动消失的非阻塞通知（比 `MsgBox` 轻量）。

## 示例

### 信息提示

```json
{
  "stepRunnerKey": "sys:notify",
  "inputParams": {
    "type": "Info",
    "msg": "任务已完成"
  }
}
```

### 多行通知

```json
{
  "stepRunnerKey": "sys:notify",
  "inputParams": {
    "type": "Info",
    "msg.var": "详情",
    "maxLines": 5,
    "style": "Default"
  }
}
```

## 陷阱

- `type` 为消息级别：`Success` / `Info` / `Warning` / `Error` / `WindowsToast`；**不是** `Default`（那是 `style` 的值）。
- `style: Default` 底部气泡（可设 `clickAction`，默认点击复制文本）；`Style2` 右侧样式。
- 需用户确认或分支用 `MsgBox`；无 output 参数。

## 相关

MsgBox · reportProgress · showText · step-runner-get
