# sys:httpserver

> **分类**：网络与云服务 · **来源**：仓库手写 · **官方**：[httpserver](https://getquicker.net/KC/Help/Doc/httpserver)

**用途**：对目录开临时 HTTP/HTTPS 文件服务，或自定义路由子程序。

**何时读**：`get` 定操作（创建/关闭/状态）后；HTTPS 域名、自定义路由前读。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 端口号 | `0` = 自动 | 防火墙放行；勿占已用端口 |
| 启用HTTPS | `https://{ip-dashed}.lan.quicker.cc:port` | 内网别名，非公网域名 |
| 文件夹路径 | 根目录 | 空目录 → 临时文件夹（纯 API 时） |
| 服务id | 标识 | 同 id 新建会关旧服务 |
| 基础验证密码 | Basic Auth 用户固定 `quicker` | 共享网络建议开启 |
| 闲置自动关闭 | 秒；`0` 不关 | |

## 模式（自定义请求处理）

路由规则每行：`路径:HTTP方法列表:子程序名`

- 路径：AbsolutePath 或正则（如 `/api`、`\\S+`）
- 方法：`GET,POST` 或 `*`
- 子程序：按模板定义 IO（request/response 词典）；**无 UI 步**、快速返回

关闭服务：`服务id` + 关闭操作；或等待窗关闭后关服。

## 相关

subprogram · http · step-runner-get · implementation-fallback
