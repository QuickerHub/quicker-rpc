
# 正则提取流水线（quicker-authoring-regex-extract-pipeline）

> **父 skill**：quicker-authoring · **参考**：`docs/authoring-references/action-patterns/regex-extract-pipeline.md`

## 何时加载

从文本（日志、HTTP 体、剪贴板）按正则提取字段并写回变量或下游模块。

## 步骤骨架

1. 输入变量 `text`（或上游模块输出）
2. `sys:regexExtract` `getGroup: 0|1` + `pattern`
3. `outputParams` 映射 **`match1 `**（注意尾随空格）或 `matches`
4. 可选 `writeClipboard` / `showText` / 分支

## 硬规则

- `step-runner get --control-field 0`（或 `1`）查可见 output 键名。
- **`match1 ` 尾随空格** — 从 schema 复制，禁止写 `match1`。
- 单值简单提取失败时兜底 **expression-first** `Regex.Match`.
- 多匹配列表勿在 evalexpression 直接展开 `{matches}` 当下标数组。

## 深度阅读

- `action-patterns/regex-extract-pipeline.md` · step-modules `regexExtract` · expression-first
