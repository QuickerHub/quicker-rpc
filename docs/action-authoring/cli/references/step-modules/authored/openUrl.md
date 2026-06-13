# sys:openUrl

> **分类**：常用基础 · **来源**：仓库手写 · **官方**：[openurl](https://getquicker.net/KC/Help/Doc/openurl)

**用途**：用默认或指定浏览器打开 URL（简单打开）；自动化控制用 `chromecontrol`。

## 示例

### 默认浏览器打开

```json
{
  "stepRunnerKey": "sys:openUrl",
  "inputParams": {
    "url.var": "链接",
    "browser": "default"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

### Chrome 打开

```json
{
  "stepRunnerKey": "sys:openUrl",
  "inputParams": {
    "url": "https://getquicker.net",
    "browser": "chrome"
  },
  "outputParams": {
    "isSuccess": "成功"
  }
}
```

## 陷阱

- `browser` 控制分支：`chrome`/`chromeIncognito`/`msedgeApp`/`local`（Quicker 内嵌 IE 小窗）/ `custom`+`exePath` / `current`（前台浏览器进程）。
- 非默认浏览器且需传参启动时，KC 建议用 `sys:run` 直接调 exe；本模块仅 `url` + 预设 browser 枚举。
- 读当前标签 URL 用 `getChromeUrl`；脚本化操作用 `chromecontrol`。

## 相关

chromecontrol · getChromeUrl · run · http · step-runner-get
