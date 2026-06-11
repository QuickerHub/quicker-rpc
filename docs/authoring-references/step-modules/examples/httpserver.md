# sys:httpserver

> **来源**：step JSON 示例 · **官方**：[httpserver](https://getquicker.net/KC/Help/Doc/httpserver)

**用途**：创建/关闭临时 HTTP(S) 文件服务或自定义路由。

## 示例

### 共享本地目录

```json
{
  "stepRunnerKey": "sys:httpserver",
  "inputParams": {
    "operation": "CreateFileServer",
    "port": "0",
    "docPath.var": "共享目录",
    "serviceId": "demo-files",
    "autoShutdownSeconds": 3600
  },
  "outputParams": {
    "isSuccess": "成功",
    "serverUrl": "访问地址"
  }
}
```

### HTTPS + 基础认证

```json
{
  "stepRunnerKey": "sys:httpserver",
  "inputParams": {
    "operation": "CreateFileServer",
    "enableHttps": "1",
    "docPath.var": "根目录",
    "password.var": "访问密码",
    "serviceId": "secure-share"
  },
  "outputParams": {
    "isSuccess": "成功",
    "serverUrlWithAccount": "带账号URL"
  }
}
```

### 关闭服务

```json
{
  "stepRunnerKey": "sys:httpserver",
  "inputParams": {
    "operation": "CloseServer",
    "serviceId": "demo-files"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```
