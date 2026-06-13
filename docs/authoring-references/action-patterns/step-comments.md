# 步骤注释（structure 自描述）

> **场景**：Agent 自写多步动作 · **难度**：S · **exemplar**：`sys:comment`（authored/comment.md）

## 何时用

- 动作 ≥3 步，或含分支/子程序/外置文件时
- 需要 `action get --return-mode structure` 或 QuickerAgent 读 structure 快速理解数据流
- **不是**给用户看的说明页（那是动作 description / 动作页 HTML）

与 **group** 的差异：`sys:comment` 纯文档、可折叠；`group` 包裹可执行子步骤。

## 步骤骨架

1. 在每一段逻辑**之前**插入 `sys:comment`（`note` 一句英文或中文）
2. 注释写：**输入变量 → 本段做什么 → 输出变量**
3. 不改步骤顺序；注释步骤无 outputParams

```json
{
  "stepRunnerKey": "sys:comment",
  "inputParams": { "note": "Read clipboard into {clip}" }
}
```

## 变量与模块

| 阶段 | 模块 | 说明 |
|------|------|------|
| 分段标题 | `sys:comment` | 仅 `note` |
| 可选分组 | `sys:group` | 要包住子步骤时用 group，不单用 comment 代替 |

## 验证

- `action get --return-mode structure`：stepRunnerKey 序列中可见 `sys:comment`
- mock/trace：comment 不改变 outputVars（无运行时副作用）

## 陷阱

- **禁止**用 comment 代替真实步骤或变量赋值
- bench/临时学习动作：**建议**每 2–4 步一条 comment，便于复盘与 L2 解构
- 发布前可删冗余 comment，但 Agent 写作期应保留

## 相关

comment · group · read-structure-first · step-runner-get
