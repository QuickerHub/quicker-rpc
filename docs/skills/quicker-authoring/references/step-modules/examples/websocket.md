# sys:websocket

> **来源**：step JSON 示例 · **官方**：[websocket](https://getquicker.net/KC/Help/Doc/websocket)

**用途**：作为 WebSocket 客户端连接服务器或向已连接客户端发消息。

## 示例

### 创建客户端

```json
{
  "stepRunnerKey": "sys:websocket",
  "inputParams": {
    "operation": "CreateClient",
    "server": "ws://127.0.0.1:8080/ws",
    "clientId.var": "客户端ID"
  },
  "outputParams": {
    "isSuccess": "成功",
    "isConnected": "已连接"
  }
}
```

### 发送文本到服务器

```json
{
  "stepRunnerKey": "sys:websocket",
  "inputParams": {
    "operation": "SendMsgToServer",
    "clientId.var": "客户端ID",
    "content.var": "消息"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 关闭客户端

```json
{
  "stepRunnerKey": "sys:websocket",
  "inputParams": {
    "operation": "CloseClient",
    "clientId.var": "客户端ID"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```
