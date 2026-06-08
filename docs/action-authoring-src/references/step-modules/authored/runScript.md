# sys:runScript

> **分类**：脚本与代码 · **来源**：仓库手写 · **官方**：[runscript](https://getquicker.net/KC/Help/Doc/runscript)

**用途**：执行 CMD/PowerShell/批处理/AHK/自定义扩展脚本。

**何时读**：`get` 定脚本类型后；编码、捕获输出、提权互斥前读。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 脚本类型 | CMD/K/C、bat、ps1、ahk、自定义 | 非 CMD 先写临时文件再执行 |
| 文件编码 | 系统默认 / UTF-8 等 | bat/cmd 常用系统编码 |
| 自定义 | 扩展名 + 程序路径 + `%FILE%` 参数模板 | |
| 工作目录 | 空 → 资源管理器当前或桌面 | |
| 控制台输出 | 绑定变量 | 自动隐藏窗并等待结束 |
| 以管理员身份运行 | 与隐藏窗/捕获输出 **互斥** | |

CMD 多行复杂逻辑勿堆本模块 → `csscript` / 外链 `.ps1`。


## 示例

<!-- QuickerModuleDoc examples -->

### 一键断开网络，又一键开启网络

```json
{
  "stepRunnerKey": "sys:runScript",
  "inputParams": {
    "script": "@echo off\\nnetsh interface set interface \"Wi-Fi\" disable\\nnetsh interface set interface \"以太网\" disable\\necho 无线网络和有线网络...",
    "runAsAdmin": "1",
    "waitToExit": "1"
  }
}
```

### 一键断开网络，又一键开启网络（BAT）

```json
{
  "stepRunnerKey": "sys:runScript",
  "inputParams": {
    "script": "@echo off\\nnetsh interface set interface \"Wi-Fi\" enable\\nnetsh interface set interface \"以太网\" enable\\necho 无线网络和有线网络已全...",
    "runAsAdmin": "1",
    "waitToExit": "1"
  }
}
```

### 安装grep存放在C:\Windows\grep目录下（CMD_H）

```json
{
  "stepRunnerKey": "sys:runScript",
  "inputParams": {
    "script": "$$setx Path \"%Path%;{cache}\" /m",
    "runAsAdmin": "1",
    "waitToExit": "1"
  }
}
```
## 相关

shelloperation · step-runner-get · implementation-fallback
