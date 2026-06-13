# Authoring reference docs (standalone)

Deep references for Quicker action authoring — **not** generated from `action-authoring-src` workflow templates.

索引：[docs/README.md](../README.md) · 管线：[authoring/PIPELINE.md](../authoring/PIPELINE.md)

## 目录

| 路径 | 角色 | 谁改 |
|------|------|------|
| [`step-modules/kc/`](step-modules/kc/) | KC 爬取全文（`npm run docs:modules:crawl`） | crawl 脚本 + 人工 |
| [`step-modules/authored/`](step-modules/authored/) | 手写 Agent 模块 ref（JSON 示例 + 陷阱） | 维护者；见 [`authored/SPEC.md`](step-modules/authored/SPEC.md) |
| [`step-modules/_catalog.md`](step-modules/_catalog.md) | 模块目录（crawl 更新） | `docs:modules:*` |
| [`action-patterns/`](action-patterns/) | 多步场景骨架（selection-pipeline、http-json-api 等） | 学习 Agent + 审核 |
| [`learned-skills/`](learned-skills/) | draft skill 登记册 + 晋升规范 | 见 [`learned-skills/SPEC.md`](learned-skills/SPEC.md) |
| [`benchmarks/`](benchmarks/) | SDK-L2 / B01–B05 编写评测复盘 | 学习 Agent |
| [`getquicker-library-search/`](getquicker-library-search/) | 动作库搜索设计（P1–P3） | 维护者 |

## 消费者

| 消费者 | 读取 |
|--------|------|
| **QuickerAgent** | `docs search(scope=references)` — MiniSearch + snippet |
| **qkrpc / AgentModel** | 整树 `**/*.md` 嵌入；`references-manifest.json` 的 `path` 指向此处 |
| **step-runner get** | `docReference` → `authored/<moduleId>` |
| **workflow topic `step-modules`** | `_catalog` 在 `docs:gen` 渲染 `catalogs/step-modules.md` 时内联 |

改 KC/authored **不必**跑 `docs:gen`，除非要刷新 `_catalog` 或 catalog 元数据。

## 与 `action-authoring-src` 的分工

| 类型 | 位置 |
|------|------|
| P0–P7 工作流、schema topic | `action-authoring-src/` → `docs:gen` |
| 单模块深文档、场景 pattern | **本目录**（直接嵌入） |
| 场景路由 skill | `action-authoring-src/skills/` → `docs:gen` → `docs/skills/` |

## Learned skills（单源 + registry 门控）

登记见 [`learned-skills/registry.json`](learned-skills/registry.json)。

- **权威源**：`docs/action-authoring-src/skills/<skillName>/`（学习 Agent 直接写）
- **生成物**：`npm run docs:gen` → `docs/skills/`（QuickerAgent on-demand）
- **审核**：`registry.json` 的 `status`（非文件路径）

流程全文：[learned-skills/SPEC.md](learned-skills/SPEC.md) · 计划：[superpowers/plans/2026-06-13-quicker-action-authoring-learning.md](../superpowers/plans/2026-06-13-quicker-action-authoring-learning.md)
