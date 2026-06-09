# sys:getChromeUrl

> **分类**：第三方软件 · **来源**：KC 官方文档（`npm run docs:modules:gen`）· [getchromeurl](https://getquicker.net/KC/Help/Doc/getchromeurl)

**用途**：Get active browser tab URL

获取当前浏览器窗口的网址。

对于chrome、msedge和firefox进程，它会首先尝试通过浏览器扩展接口获取网址。

如果失败了，会尝试模拟Ctrl+L跳转到地址栏复制网址。

[image]
