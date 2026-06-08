# sys:smtp

> **分类**：网络与云服务 · **来源**：仓库手写 · **官方**：[smtp](https://getquicker.net/KC/Help/Doc/smtp)

**用途**：SMTP 发邮件（含 SSL 端口）。

**何时读**：账号凭据存放、附件多行路径前读。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 端口 | 25 / 587+SSL 等 | Gmail 常用 587 |
| 收件人 | 必填；`,` 分隔 | |
| 附件 | 每行一路径 | 勿过大 |
| 内容为html | 正文 HTML | |

凭据用 **stateStorage** 等本地存，勿写进可分享动作。禁止群发垃圾邮件。


## 示例

<!-- QuickerModuleDoc examples -->

### 43.SMTP发送邮件

```json
{
  "stepRunnerKey": "sys:smtp",
  "inputParams": {
    "account": "acc@1.com",
    "password": "mypwd",
    "sender": "admin@1.com",
    "senderName": "测试员",
    "to": "b@1.com,a@1.com",
    "cc": "cc@163.com",
    "subject": "测试结果",
    "content": "你好呀"
  }
}
```
## 相关

step-runner-get · stateStorage · implementation-fallback
