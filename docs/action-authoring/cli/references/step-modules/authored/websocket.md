# sys:websocket
<!-- qkrpc-search-aliases: WebSocket, ws连接 -->

> **分类**：网络与云服务 · **来源**：仓库手写 · **官方**：[websocket](https://getquicker.net/KC/Help/Doc/websocket)

**用途**：WebSocket 客户端长连接，或向本机 WS 服务客户端发消息。

**何时读**：连接子程序 IO、连接 ID 复用、发/关连接前读。

## 模式（客户端）

1. 定义消息子程序：`Data` 输入，`Response` 输出（非空则回发服务器）
2. 连接：`连接ID` + `消息处理子程序`；连接可跨动作保持
3. 发消息 / 查状态 / 关闭：同一 `连接ID`

子程序**不**加入主程序步骤列表；主程序步不执行。

认证：Basic/Digest 两行（用户/密码）；cookie 多行 `name:value`。

## 相关

subprogram · httpserver · http · step-runner-get
