# sys:cloud_oss

> **来源**：step JSON 示例 · **官方**：[cloud_oss](https://getquicker.net/KC/Help/Doc/cloud_oss)

**用途**：上传文件/图片/文本到阿里云 OSS、腾讯 COS、七牛 kodo。

## 示例

### 阿里云上传剪贴板图片

```json
{
  "stepRunnerKey": "sys:cloud_oss",
  "inputParams": {
    "operation": "Upload",
    "vendor": "Aliyun",
    "vendorSettings": "$$Endpoint:https://{EndPoint}\\nAccessKey:{AccessKey}\\nAccessKeySecret:{AccessKeySecret}\\nBucketName:{Bucket}",
    "key": "uploads/{当前时间}.png",
    "content.var": "剪贴板图片"
  },
  "outputParams": {
    "isSuccess": "成功",
    "vendorUrl": "对象URL"
  }
}
```

### 上传本地文件

```json
{
  "stepRunnerKey": "sys:cloud_oss",
  "inputParams": {
    "operation": "Upload",
    "vendor": "Aliyun",
    "vendorSettings": "$$Endpoint:https://{EndPoint}\\nAccessKey:{AccessKey}\\nAccessKeySecret:{AccessKeySecret}\\nBucketName:{Bucket}",
    "key.var": "对象键",
    "content.var": "本地文件路径"
  },
  "outputParams": {
    "isSuccess": "成功",
    "vendorUrl": "对象URL",
    "customUrl": "CDN地址"
  }
}
```

### 腾讯云 COS 上传文本

```json
{
  "stepRunnerKey": "sys:cloud_oss",
  "inputParams": {
    "operation": "Upload",
    "vendor": "Tencent",
    "vendorSettings": "$$SecretId:{SecretId}\\nSecretKey:{SecretKey}\\nRegion:{Region}\\nBucket:{Bucket}",
    "key": "notes/readme.txt",
    "content": "hello from quicker"
  },
  "outputParams": {
    "isSuccess": "成功",
    "vendorUrl": "对象URL"
  }
}
```
