# sys:tempImgBed

> **分类**：网络 · **来源**：仓库手写 · **官方**：[tempimgbed](https://getquicker.net/KC/Help/Doc/tempimgbed)

**用途**：将图片变量上传到 Quicker 临时图床（约 10 分钟删除），返回 URL。

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

## 陷阱

- 仅接受 **Image 类型变量**（如 `screenCapture` 的 `img`）；需联网；勿上传敏感/非法内容。
- 链接临时有效，长期存储请 `WriteImageFile` 或自有图床；失败时 `stopIfFail` 控制是否停动作。

## 相关

screenCapture · WriteImageFile · imageOperations · step-runner-get
