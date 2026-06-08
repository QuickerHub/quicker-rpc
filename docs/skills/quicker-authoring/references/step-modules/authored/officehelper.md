# sys:officehelper

> **分类**：第三方软件 · **来源**：仓库手写 · **官方**：[officehelper](https://getquicker.net/KC/Help/Doc/officehelper)

**用途**：对前台 Office/WPS 窗口执行 VBA 或格式操作（低权限 COM）。

**何时读**：`get` 定「应用程序」与操作后；宏名 vs 内联代码前读。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 应用程序 | Word/Excel/PPT/WPS… | 须**用户正常启动**的实例，非 Quicker 提权拉起 |
| VBA宏名称或代码 | 已有宏名 **或** 完整 `Sub…End Sub` | 内联写全宏体 |
| 低权限 | 默认 | 无法控制「管理员身份」Office |

## 模式（前置）

| 环境 | 要求 |
|------|------|
| Office | 信任「VBA 工程对象模型」 |
| WPS | 装 VBA 模块 + 信任 VB 项目访问 |
| Excel VBA | 执行后 **丢失 Undo** — 先备份 |

多同名进程时可能绑错活动文档；WPS 版本差异大。

## 相关

excelreadwrite · step-runner-get · implementation-fallback
