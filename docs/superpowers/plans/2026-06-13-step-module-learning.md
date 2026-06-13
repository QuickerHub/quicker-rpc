# step-module 学习 subagent(逐模块蒸馏 authored ref)

> **For agentic workers:** 每 tick 读 progress → `--next` → 对每个模块执行「单模块学习协议」→ `--mark-done` / `--mark-skip`。
> **Loop:** 持续模式 — 先 sleep 5s 再 tick(`pwsh scripts/run-learning-loop.ps1`);arm 前 agent 先执行一轮,避免启动双跑;每 tick **2** 模块。

**Goal:** 对全部 step-runner 模块逐个「学习」,把官方 KC 文档(人写、含杂讯)蒸馏为干净的 Agent 知识:
每个 pending 模块最终落为 `authored/<id>.md`(按 [authored/SPEC.md](../../authoring-references/step-modules/authored/SPEC.md))
或在进度文件中记录 `skipped` + 理由(`step-runner get` 已够,无需 reference)。

**Architecture:** `init-step-module-learning-progress.mjs` 初始化 `.learning-progress.json`;
loop 驱动 `step-module-learning-progress.mjs`(`--next` / `--mark-done` / `--mark-skip --reason`);
产出经 `npm run docs:modules:analyze` 自动发现并编入 `docs_get_reference({ topic: "step-modules", file: "<id>" })`。

**信息源优先级(降噪原则):**

| 优先级 | 来源 | 角色 |
|--------|------|------|
| 1 | `qkrpc step-runner get`(逐 `controlField` 分支) | **权威 schema**:键名、类型、purpose、selection |
| 2 | `kc/<id>.md`(已爬取的 KC 官方全文) | 素材库:场景、分支语义、陷阱线索 |
| 3 | 实跑验证(`action run --trace`) | 解决 1–2 无法确认的输出形状 / 行为分歧 |
| 4 | KC 网站实时页(WebFetch) | **仅当** `hasKc: false` 或爬取稿明显残缺 |

杂讯处理:KC 原文中的概述、营销列举、截图占位、版本史一律丢弃(SPEC §4 删除规则);
**禁止**整段复述 get 已有的 purpose。学到的结论必须能落到「写步骤」这一件事上。

---

## 单模块学习协议(P1–P5)

1. **P1 Schema**:`qkrpc step-runner get --key sys:<key> --json`;多分支模块对每个主要
   `controlField` 值再 get 一次,记录互斥参数与默认值。
2. **P2 素材**:读 `kc/<id>.md`。提取 get 没有的信息——wire 陷阱、
   分支语义、外链文件协议、与其它步骤的耦合。`hasKc: false` 时才 WebFetch KC 实时页。
3. **P3 判定**:对照 SPEC §3.2 选档位(S/M/L/XS)。若 P2 没有提炼出**任何** get 之外的增量
   (典型:`sys:delay`、`sys:newGuid` 这类单参数模块),不写文件,直接
   `--mark-skip <id> --reason "<一句话>"`,本模块结束。
4. **P4 实跑验证(可选)**:仅当 `liveRun: true` 且 P1–P3 存在不确定点(输出变量形状、
   分支行为、默认值实际效果)时执行:按 authoring-workflow 创建临时动作(名称前缀
   `__module_learning__`),patch 入单步,`qkrpc action run --id <guid> --trace --json`
   观察输出;验证后**删除该临时动作**(仅允许删除本协议自建的 `__module_learning__*`)。
   交互式模块(`liveRun: false`)跳过本步。
5. **P5 落盘**:按 SPEC §3 结构写 `docs/authoring-references/step-modules/authored/<id>.md`
   (可用 `npm run docs:modules:new -- sys:<key>` 脚手架);自检 SPEC §7 清单;
   `node scripts/step-module-learning-progress.mjs --mark-done <id>`。

**升级出口(schema-backed):** 若模块协议重到 reference 装不下(SPEC §3.3,如大段 formDef/DSL),
authored 稿只留指向 + 示例,并在 `action-authoring-src/schemas/` 起草独立 schema topic
(登记 `manifest/topics.json`),在进度条目加 `"schemaTopic": "<name>"` 备注。

**批末(每 tick 收尾):**

```powershell
npm run docs:modules:analyze   # 自动发现新 authored
npm run docs:modules:gen       # 重建 _catalog 等
npm run docs:gen               # 渲染 workflow topic
```

## Loop prompt

```text
续跑 step-module learning:读 docs/superpowers/plans/2026-06-13-step-module-learning.md 与
docs/authoring-references/step-modules/.learning-progress.json;
node scripts/step-module-learning-progress.mjs --next;若 ALL_DONE 则跑批末三连并停止 loop。
否则对本批每模块执行「单模块学习协议 P1–P5」;勿改 kc/ 正文;
临时动作仅限 __module_learning__ 前缀且用后即删。对话结束立即执行,不要等待用户。
```

## 完成

- `.learning-progress.json`:全部模块 `done` 或 `skipped`(skipped 必有 reason)
- `npm run docs:gen` 通过;`docs_get_reference({ file: "<id>" })` 可读新 authored
- 抽查:`pnpm test:docs-search:eval --prefix agent-gui -- --probe "sys:<key>"`
