# 动作编写知识维护流程

> 当前权威流程。历史阶段计划已删除；进度以 JSON 状态文件为准。

## 状态源

| 内容 | 权威文件 |
|------|----------|
| 场景 pattern 与待办 | `action-patterns/.learning-progress.json` |
| Pattern 写法 | `action-patterns/SPEC.md` |
| 场景 skill 与审核状态 | `learned-skills/registry.json`、`learned-skills/SPEC.md` |
| Step module 学习结果 | `step-modules/authored/`、`step-modules/.learning-progress.json` |
| Benchmark | `benchmarks/`、`agent-gui/benchmarks/authoring-tasks.json` |

Step module 首轮学习已经完成。后续按具体模块维护 `authored/`，不再启动持续学习循环。
动作级 queue 尚未全部完成时，使用：

```powershell
node scripts/action-authoring-learning-progress.mjs --next
```

## 动作级任务协议

### `library-exemplar`

1. 用动作库 search 和 shared get 只读解构 2–3 个 exemplar。
2. 记录步骤链、变量流和 expression/module/script 取舍。
3. 写入 `benchmarks/retro/`；有泛化价值再创建 pattern。

### `pattern-distill`

1. 收集 2–3 个 exemplar。
2. 按 `action-patterns/SPEC.md` 写场景骨架。
3. 用 `__pattern_learning__*` 临时动作完成 mock assert 或 trace 验证。
4. 确有稳定复用价值时，按 `learned-skills/SPEC.md` 创建 draft skill。

### `skill-promote`

1. 检查 registry、pattern 和 mock/trace 证据。
2. 补全 `SKILL.src.md`，运行 `npm run docs:gen`。
3. 人类审核后标记 `promoted`；未获审核时只能标记 `review`。

### `pattern-enrich`

只增加新的 exemplar、变量流或动作级陷阱，不复制第三方动作实现正文。

### `sdk-benchmark`

按 `agent-gui/benchmarks/authoring-tasks.json` 执行指定 task；存在 mock profile 时必须
`assert=true` 通过，再记录 retro。

## 硬规则

- `step-runner search` 后必须 `step-runner get`，禁止猜 `inputParams`。
- 程序体在 `.quicker/` 磁盘编辑后走 `workspace_program patch`，禁止内联 steps JSON。
- patch 后信任返回的 `editVersion`，禁止立即 full get。
- 动作库/shared 只读；临时学习动作完成后删除。
- 有 mock profile 时，mock assert 是完成和 skill 晋升的门槛。
- 修改 `action-authoring-src/skills/` 后必须运行 `npm run docs:gen`。

## 完成一项 queue

```powershell
node scripts/action-authoring-learning-progress.mjs --mark-done <queue-id>
```

同时更新相关 pattern/registry/retro；不要另建日期命名的实施计划。
