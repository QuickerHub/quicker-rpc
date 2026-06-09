# sys:tempImgBed

> **来源**：step JSON 示例 · **官方**：[tempimgbed](https://getquicker.net/KC/Help/Doc/tempimgbed)

**用途**：将图片变量上传到临时图床并返回 URL。

## 示例

### 上传图片变量

```json
{
  "stepRunnerKey": "sys:tempImgBed",
  "inputParams": {
    "imgVar.var": "截图"
  },
  "outputParams": {
    "isSuccess": "成功",
    "url": "图片链接"
  }
}
```

### 上传并用于分享

```json
{
  "stepRunnerKey": "sys:tempImgBed",
  "inputParams": {
    "imgVar.var": "二维码"
  },
  "outputParams": {
    "url": "图片链接"
  }
}
```
