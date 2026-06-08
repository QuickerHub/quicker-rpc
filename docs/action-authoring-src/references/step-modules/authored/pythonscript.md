# sys:pythonscript

> **分类**：脚本与代码 · **来源**：仓库手写 · **官方**：[pythonscript](https://getquicker.net/KC/Help/Doc/pythonscript)

**用途**：在 Quicker 进程内执行 Python 3（pythonnet）。

**何时读**：配置 python 路径、读写变量 API 前读。

## wire 要点

| param | wire | notes |
|-------|------|-------|
| 脚本内容 | inline / `.file` | `##.py` 外链 |
| Python路径 | 可选 dll 目录 | 1.35.37+ 直指定；空则 PATH 找 `python39` 等 |
| 变量 API | `quicker.context.GetVarValue` / `SetVarValue` | 优先简单类型；列表/词典谨慎 |

## 禁止 / 常见错误

| 写法 | 问题 |
|------|------|
| py 里 COM 控 Office | 与 Quicker 提权冲突 |
| 返回复杂 Python 对象 | 转换易崩；在 py 内算完再 Set 简单值 |
| 非官网 Python | 可能无法加载 |

支持 3.7–3.12；位数与 Quicker 一致（64/32）。

## 相关

csscript · step-runner-get · action-project-files · implementation-fallback
