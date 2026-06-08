# sys:record

> **分类**：常用基础 · **来源**：仓库手写 · **官方**：[record](https://getquicker.net/KC/Help/Doc/record)

**用途**：交互录制键鼠，输出给 `playRecords` 重放。

**何时读**：与 `inputScript` 选型：录制绝对坐标 vs 行式脚本。

## wire 要点

| 要点 | 说明 |
|------|------|
| 输出「录制数据」 | 供 `sys:playRecords` |
| 环境敏感 | 分辨率、窗位、输入法须与录制时一致 |
| 测试功能 | 可能调整 |

运行后等 2s 自动开始；右下角控制窗停止/保存。精细自动化优先 **inputScript**。

## 相关

playRecords · inputScript · step-runner-get
