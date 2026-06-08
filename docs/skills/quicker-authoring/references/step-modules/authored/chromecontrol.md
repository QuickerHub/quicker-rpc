# sys:chromecontrol

> **分类**：第三方软件 · **来源**：仓库手写 · **官方**：[chromecontrol](https://getquicker.net/KC/Help/Doc/chromecontrol)

**用途**：经 Quicker 浏览器扩展控制 Chrome/Edge/Firefox 标签页与页面脚本。

**何时读**：`get` 定「操作类型」后；选择器、标签页 ID、MV3 脚本权限前读。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 操作类型 | `controlField` | 打开 URL / 执行脚本 / 后台命令等 |
| 标签页ID | 留空=活动标签 | 连续步操作同一 tab 时复用 |
| 选择器 | CSS；或 `xpath:…` | 扩展可辅助复制选择器 |
| 浏览器连接 | 首步前台窗口或「设置连接的浏览器」 | 动作内保持同一浏览器实例 |

## 模式（环境约束）

| 约束 | 说明 |
|------|------|
| MV3 | 无旧式后台脚本；「对标签页运行脚本」需开发者模式或「允许用户脚本」(138+) |
| 限制页 | `chrome://`、扩展商店、file:// 默认不可用 |
| 多浏览器 | 可按进程同时连不同类型；同浏览器多副本不支持 |

消息传递为文本；iframe/上传等可能需人工先点一次页面。

## 禁止 / 常见错误

| 写法 | 问题 |
|------|------|
| 未装/未连扩展 | Quicker 未连接 |
| 无痕未开权限 | 扩展被禁 |

## 相关

getChromeUrl · step-runner-get · http · implementation-fallback
