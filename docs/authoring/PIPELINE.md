# 动作编写文档管线

> 维护者地图：哪里是**权威源**、哪里是**生成物**、运行时**谁读谁**。

## 一张图

```text
┌─────────────────────────────────────────────────────────────────┐
│ 手写源码                                                         │
│  docs/action-authoring-src/     模板 + manifest（workflow/schema）│
│  docs/authoring-references/     深参考（step-modules、patterns） │
└───────────────┬─────────────────────────────┬───────────────────┘
                │ npm run docs:gen            │ 直接嵌入 / agent-gui 索引
                ▼                             ▼
┌───────────────────────────┐   ┌─────────────────────────────────┐
│ 生成物（勿手改正文）         │   │ 运行时深参考                      │
│  action-authoring/cli/*.md │   │  AgentModel ← authoring-references│
│  docs/skills/*/            │   │  agent-gui docs search            │
│  cli/references-manifest   │   │  step-runner docReference       │
└───────────────┬───────────┘   └─────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────┐
│ 消费者                                                           │
│  qkrpc guide get          ← cli/*.md 嵌入                        │
│  qkrpc agent setup        ← docs/skills/*                        │
│  QuickerAgent chat        ← skills + authoring-references 搜索   │
└─────────────────────────────────────────────────────────────────┘
```

## 目录职责

| 路径 | 改这里？ | 说明 |
|------|----------|------|
| [`action-authoring-src/`](../action-authoring-src/) | **是** | 工作流 topic、schema、partials、`manifest/*.json` |
| [`authoring-references/`](../authoring-references/) | **是** | KC 爬取 + 手写 `authored/` 模块 ref、action-patterns、benchmarks |
| [`action-authoring/cli/`](../action-authoring/cli/) | **否** | `docs:gen` 输出 topic + `references-manifest.json` |
| [`skills/`](../skills/) | **慎改** | setup 分发；正文多由 `docs:gen` 从 src 生成 |
| [`.cursor/skills/`](../../.cursor/skills/) | **是** | 仓库贡献者专用（构建/发布/UI）；**场景子 skill 不写此处** |

## 生成命令

```powershell
npm run docs:gen          # 写 cli/ + skills/（有 mtime 跳过）
npm run docs:check        # CI：生成物过期则失败
npm run docs:gen:force    # 强制重写

npm run docs:modules:crawl   # KC → authoring-references/step-modules/kc/
npm run docs:modules:gen     # 分析 + crawl
```

自动触发：`build.ps1 -t`、`dotnet build QuickerRpc.AgentModel`、`agent-gui` predev/prebuild。

## 消费者对照

| 消费者 | 读取 |
|--------|------|
| `QuickerRpc.AgentModel` | `action-authoring/cli/*.md`（顶层 topic）、`authoring-references/**/*.md`、`schemas/*.json`、`references-manifest.json` |
| `qkrpc guide get` | AgentModel 嵌入 |
| `qkrpc agent setup` | `docs/skills/<name>/` |
| QuickerAgent `docs` 工具 | skills + `authoring-references` MiniSearch |
| 人类 | [`cli-commands.md`](../cli-commands.md)、本索引 [`README.md`](../README.md) |

## 常见错误

| 错误 | 正确做法 |
|------|----------|
| 直接改 `action-authoring/cli/authoring-workflow.md` | 改 `action-authoring-src/workflows/`，再 `docs:gen` |
| 期望在 `cli/references/` 找 module 正文 | 正文只在 `authoring-references/`；manifest 的 `path` 指向该目录 |
| 维护两份 expressions 正文 | 只改 `action-authoring-src/partials/expressions-body.md`（见下节） |
| 把 `superpowers/` 当用户文档 | 仅内部 spec/plan |

## Expressions 文档（单一权威源）

| 产出 | 来源 |
|------|------|
| `partials/expressions-body.md` | **唯一正文**（$=、evalexpression、multi-var 等） |
| `schemas/expressions.md` | topic 壳 + `{{#include-partial expressions-body}}` |
| `cli/expressions.md`、`skills/quicker-authoring/references/expressions.md` | `docs:gen` 从 schema topic |
| `skills/quicker-eval-expression/references/expressions.md` | **同上 schema**（不再单独 `expressions.src.md`） |
| `skills/.../evalexpression-examples.md` | 复制 `authoring-references/step-modules/authored/evalexpression.md` |
| `step-modules` topic / authored `evalexpression` | 步骤 JSON 示例（非语法正文） |

改表达式语法：**只改 `expressions-body.md`**，然后 `npm run docs:gen`。

## 深参考子系统

| 子目录 | 用途 |
|--------|------|
| [`authoring-references/step-modules/`](../authoring-references/step-modules/) | 模块 KC + authored 示例 |
| [`authoring-references/action-patterns/`](../authoring-references/action-patterns/) | 多步模式（selection-pipeline 等） |
| [`authoring-references/learned-skills/`](../authoring-references/learned-skills/) | draft skill 晋升 registry（见 `SPEC.md`） |
| [`authoring-references/benchmarks/`](../authoring-references/benchmarks/) | SDK-L2 / 编写评测复盘 |
| [`authoring-references/getquicker-library-search/`](../authoring-references/getquicker-library-search/) | 动作库搜索设计 |

## Skill 学习与发布

场景子 skill **权威源**：`docs/action-authoring-src/skills/<name>/`（`SKILL.src.md` + `manifest.json`）。

登记于 [`learned-skills/registry.json`](../authoring-references/learned-skills/registry.json)（`draft` → `review` → `promoted`）。

IDE 续跑：`/learn-authoring` → `npm run docs:authoring:learning-next`。

```text
学习 Agent 写 src → npm run docs:gen → docs/skills/<name>/（on-demand catalog）
人类审核 → registry promoted（无需从 .cursor 复制）
```

批量校验 / 标记 promoted：`node scripts/promote-learned-skills-from-registry.mjs [--promote]`。  
子 skill 由 `generate-authoring-docs.mjs` 自动扫描（除 `quicker-authoring` / `quicker-eval-expression`）。

## 逻辑目录（Phase 3）

`docs/` 按角色分区索引，**文件路径未搬迁**（AgentModel / `docs:gen` 嵌入路径不变）：

| 索引 | 说明 |
|------|------|
| [`product/README.md`](../product/README.md) | 用户、集成、插件 |
| [`engineering/README.md`](../engineering/README.md) | agent-gui、dev、子项目 |
| [`authoring/README.md`](README.md) | 本页 + PIPELINE |
| [`internal/README.md`](../internal/README.md) | superpowers 内部稿 |

物理 `mv`（如 `action-authoring-src` → `authoring/guide-src`）仅在需要时单独 PR，须同步 AgentModel、agent-gui、生成脚本。

## 参见

- [`action-authoring/README.md`](../action-authoring/README.md) — 生成钩子细节
- [`authoring-references/README.md`](../authoring-references/README.md) — module ref 规范
- [`agent-skill-distribution.md`](../agent-skill-distribution.md) — setup 安装路径
