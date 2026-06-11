# sys:enc

> **分类**：计算与数据结构 · **来源**：仓库手写 · **官方**：[enc](https://getquicker.net/KC/Help/Doc/enc)

**用途**：对称/非对称加解密、哈希、HMAC、自用加解密。

**何时读**：`get` 定「操作类型」后；输入/输出为 Base64/HEX 编码前读 wire。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 操作类型 | `controlField` | 对称/非对称/哈希/HMAC/自用加解密 |
| 输入内容类型 | 文本 / Base64 / HEX | 决定「输入」字节解释 |
| 输入 | inline / `.var` | UTF-8 文本处理 |
| 秘钥 / IV | 算法相关长度 | 见 get purpose |
| 输出 | Base64 / HEX / 文本 | 解密用「文本结果」 |

## 模式

| 操作 | 要点 |
|------|------|
| 哈希 / 键控哈希 | 选具体算法；**文件**哈希 → `checkPathExists` 流式 |
| 自用加解密 | 账号绑定 AES；仅本机 Quicker 用户可解 |
| API 签名 | 常配合 `http`（云厂商文档） |

## 相关

step-runner-get · http · checkPathExists · implementation-fallback
