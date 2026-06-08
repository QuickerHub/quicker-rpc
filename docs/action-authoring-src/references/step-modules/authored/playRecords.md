# sys:playRecords

> **分类**：常用基础 · **来源**：仓库手写 · **官方**：[playrecord](https://getquicker.net/KC/Help/Doc/playrecord)

**用途**：重放 `record` 或托盘「键鼠录制工具」的数据。

**何时读**：绑定录制数据、调速、中止方式前读。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 录制数据 | 文本块 | `816; MC; Left,x,y,1;` 等行 |
| 重放速度 | `1` = 原速 | `1.5` 更快 |

绝对坐标，环境须稳定。中止：配置「停止运行中动作」快捷键。

可编辑数据行调试；复杂流程用 **inputScript**。

## 相关

record · inputScript · step-runner-get
