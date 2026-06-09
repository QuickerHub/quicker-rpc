# sys:smtp

> **来源**：step JSON 示例 · **官方**：[smtp](https://getquicker.net/KC/Help/Doc/smtp)

**用途**：通过 SMTP 发送邮件。

## 示例

### 基础发送

```json
{
  "stepRunnerKey": "sys:smtp",
  "inputParams": {
    "server": "smtp.example.com",
    "port": "587",
    "useSsl": "1",
    "account.var": "邮箱账号",
    "password.var": "邮箱密码",
    "sender.var": "发件地址",
    "senderName": "通知",
    "to.var": "收件人",
    "subject.var": "主题",
    "content.var": "正文"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### 抄送与 HTML

```json
{
  "stepRunnerKey": "sys:smtp",
  "inputParams": {
    "server": "smtp.example.com",
    "port": "587",
    "useSsl": "1",
    "account.var": "邮箱账号",
    "password.var": "邮箱密码",
    "sender.var": "发件地址",
    "to": "a@example.com,b@example.com",
    "cc.var": "抄送",
    "subject": "报告",
    "content": "<p>HTML 正文</p>",
    "isHtml": "1"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```
