# sys:tempcloudstore

> **分类**：网络与云服务 · **来源**：仓库手写 · **官方**：[tempcloudstore](https://getquicker.net/KC/Help/Doc/tempcloudstore)

**用途**：临时上传文本/图片/文件，得 **10 分钟**有效 URL。

**何时读**：选型 vs `cloud_oss`、限速与大小限制前读。

## wire 要点

| 类型 | 限制 |
|------|------|
| 文本 | ≤1MB |
| 文件 | ≤10MB |
| 间隔 | 专业版 5s；免费版 10min |

勿违法内容、勿大规模分发。输出「网址」可配合二维码展示。


## 示例

<!-- QuickerModuleDoc examples -->

### 将图片imageVar临时上传至Quicker并获得临时访问地址

```json
{
  "stepRunnerKey": "sys:tempcloudstore",
  "inputParams": {
    "imageVar.var": "imageVar"
  },
  "outputParams": {
    "url": "url"
  }
}
```
## 相关

cloud_oss · createQrCode · step-runner-get
