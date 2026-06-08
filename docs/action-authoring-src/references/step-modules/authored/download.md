# sys:download

> **分类**：网络与云服务 · **来源**：仓库手写 · **官方**：[download](https://getquicker.net/KC/Help/Doc/download)

**用途**：从 URL 下载小文件到本地。

**何时读**：需 Cookie/请求头、重命名已存在文件、取 ETag/Content-MD5 时。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 保存文件夹 | 可选 | 空 → 系统「下载」目录 |
| 保存文件名 | 可选 | 空 → 从响应/URL 推断；冲突可能覆盖 |
| 请求头 / Cookie | 多行 `Name:Value` | 通常不必；鉴权下载时从浏览器 Network 复制 |
| 如果文件已存在 | 自动重命名 | 避免覆盖 |
| 输出 | 文件路径、ETag、Content-MD5 | 1.42.23+ 响应头元数据 |

大文件/断点续传 → 用 `http` 结果类型「文件」或专用流程。

## 相关

http · step-runner-get · fileOperation · implementation-fallback
