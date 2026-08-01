# learn-authoring — 执行动作编写知识任务

以 [`docs/authoring-references/learning-workflow.md`](../../docs/authoring-references/learning-workflow.md)
为唯一流程规范，执行一轮动作级学习；不要读取历史计划。

1. `qkrpc_health`；失败则 `qkrpc_wait`，禁止 shell 连环探测。
2. 运行 `node scripts/action-authoring-learning-progress.mjs --next`。
3. `ALL_DONE` 时报告完成；否则严格按 workflow 中对应 `type` 的协议执行本批。
4. 用 `--mark-done <queue-id>` 更新状态；修改 skill source 后运行 `npm run docs:gen`。
5. 动作库/shared 只读；临时 `__pattern_learning__*` 动作用后删除。

用户明确要求持续执行时，先完成本轮，再运行 `pwsh scripts/run-action-learning-loop.ps1`。
