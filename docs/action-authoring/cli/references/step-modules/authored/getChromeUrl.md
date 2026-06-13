# sys:getChromeUrl

> **分类**：第三方软件 · **来源**：仓库手写 · **官方**：[getchromeurl](https://getquicker.net/KC/Help/Doc/getchromeurl)

**用途**：读取当前活动浏览器标签页 URL（Chrome/Edge/Firefox）。

## 示例

### 获取当前标签 URL

```json
{
  "stepRunnerKey": "sys:getChromeUrl",
  "outputParams": {
    "isSuccess": "成功",
    "output": "当前URL"
  }
}
```

## 陷阱

- 优先经 Quicker **浏览器扩展**取 URL；失败则模拟 Ctrl+L 复制地址栏——需前台为支持的浏览器且扩展已安装。
- 复杂标签/脚本自动化用 `sys:chromecontrol`；本模块仅读当前 URL，无输入参数（除 `stopIfFail`）。

## 相关

chromecontrol · openUrl · writeClipboard · step-runner-get
