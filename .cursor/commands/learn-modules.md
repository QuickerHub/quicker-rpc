# learn-modules — 逐模块学习 step-runner 并蒸馏 authored ref

按 [docs/superpowers/plans/2026-06-13-step-module-learning.md](../../docs/superpowers/plans/2026-06-13-step-module-learning.md) 执行一轮模块学习。

## 步骤

1. 若 `docs/authoring-references/step-modules/.learning-progress.json` 不存在:
   `npm run docs:modules:learning-init`
2. `node scripts/step-module-learning-progress.mjs --next` 取本批模块 id。
   输出 `ALL_DONE` 时:跑 `npm run docs:modules:gen && npm run docs:gen`,结束。
3. 对本批每个模块执行 plan 中的「单模块学习协议 P1–P5」:
   - `qkrpc step-runner get --key sys:<key> --json`(逐 `controlField` 分支)
   - 读 `kc/<id>.md` 提取 get 之外的增量
   - 无增量 → `--mark-skip <id> --reason "<一句话>"`
   - 不确定点 → `__module_learning__` 临时动作实跑 `--trace` 验证,用后即删
   - 写 `authored/<id>.md`(SPEC §3/§7)→ `--mark-done <id>`
4. 批末:`npm run docs:modules:analyze && npm run docs:modules:gen && npm run docs:gen`

## 约束

- 勿改 `kc/` 正文;勿删除非 `__module_learning__` 前缀的动作
- 用户要求持续后台跑时:先手动执行一轮,再 `pwsh scripts/run-learning-loop.ps1` arm loop
