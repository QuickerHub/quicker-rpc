# sys:cloud_oss

> **分类**：网络与云服务 · **来源**：仓库手写 · **官方**：[cloud_oss](https://getquicker.net/KC/Help/Doc/cloud_oss)

**用途**：上传文件/图片/文本到阿里云 OSS、腾讯 COS、七牛 kodo。

**何时读**：厂商「服务商参数」词典、对象名与自定义域名前读。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 操作类型 | 目前仅上传 | |
| 服务商参数 | 厂商相关键 | AccessKey、Bucket、Region 等 — 见 KC |
| 对象名 | 如 `_site/home/a.png` | **勿**以 `/` 开头 |
| 上传内容 | 文件路径 / 图片变量 / 文本 | |
| 自定义域名 | `https://cdn.example.com` | Bucket 须公共读 |

勿分享含密钥的动作。

## 相关

tempcloudstore · fileOperation · step-runner-get
