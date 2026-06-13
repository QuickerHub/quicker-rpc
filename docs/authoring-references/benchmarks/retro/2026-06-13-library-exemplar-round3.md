# 动作库 exemplar 解构 — Round 3（2026-06-13）

> Phase 3 L2-A · 只读 `library search` + `action shared get --return-mode structure`

## 检索

| 关键词 | matchCount | 备注 |
|--------|------------|------|
| 剪贴板 | 1129 | Top：9ec53d43 剪贴板、04393db9 Translator |
| 选中文本 | 1473 | （Round 1 已记） |

CLI：`%LOCALAPPDATA%\Programs\qkrpc\qkrpc.exe`（`publish/cli-new` 缺 `shared get` 时用安装版）

## 解构（structure）

### 99363ea4 — 剪贴板/HTTP 类标杆（registry clipboard-pipeline）

```text
sys:http → sys:regexExtract → sys:writeClipboard → sys:notify
```

- **启示**：未用 evalexpression，用 `regexExtract` 抽字段再写剪贴板；与 B02「jsonExtract」是姊妹路径
- **Agent**：HTTP 响应体 → 正则/JSON 提取二选一，先 `step-runner get` 再选型

### 875ef658 — 选中本行文本

```text
sys:keyInput → sys:delay → sys:keyInput
```

- **启示**：选区类动作常用 **按键序列 + 短 delay**；与 selection-pipeline 的 getSelectedText 路径不同
- **Agent**：库内同领域多 exemplar 对比，勿假定只有一种写法

### 9ec53d43 — 剪贴板（高赞 UI 动作）

```text
sys:subprogram → sys:csscript  (+ subProgramCount: 1)
```

- **启示**：复杂 UI/状态用子程序 + csscript；**不适合** Agent 默认骨架（违背 expression-first）
- **Agent**：识别后标记「参考架构，写作勿抄 csscript 主逻辑」

## 是否新 pattern？

| 候选 | 判定 |
|------|------|
| regexExtract 写回剪贴板 | **并入** clipboard-pipeline / regex-extract-pipeline（已有） |
| keyInput+delay 选区 | **记入** selection-pipeline 文档「库内另路径」即可，不新开 slug |
| 步骤注释自描述 | **新** `step-comments`（见 action-patterns/step-comments.md） |

## 硬规则再确认

- `shared get`：`readOnly: true`，`patchAllowed: false`
- 写作：`action create` 本地动作；exemplar 只解构不 patch
