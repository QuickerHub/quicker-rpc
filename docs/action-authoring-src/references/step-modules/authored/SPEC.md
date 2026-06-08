# step-modules 手写 reference 规范

> **读者**：维护 `references/step-modules/authored/<id>.md` 的贡献者与 Agent。  
> **前提**：`qkrpc_step_runner_get` 已提供参数键名、`purpose`、`controlField.selection`；本 reference **只补充 get 没有的写步骤信息**。

## 1. 定位（与 get / KC 爬取的分工）

| 层级 | 来源 | 本规范是否覆盖 |
|------|------|----------------|
| 键名、类型、purpose | `step-runner get` | **不写**（禁止逐参数复述官方【】说明） |
| 选型 | `implementation-fallback` · `expressions` | 仅 1 句「何时读」指向 |
| Agent 补充 | **本 reference** | wire 陷阱、controlField 分支、外链文件、协议格式、diagnostics |
| 原始说明 | [KC 官方](https://getquicker.net/KC/Help/Doc/) | 链接保留；正文压缩摘录 |

KC 爬取稿（`../<id>.md`）= **素材库**（已全部迁移）；手写稿 = **Agent 用压缩版**。`step-module-skip.json` → `keep` 为空，仅 `authored` 有 reference。

## 2. 文件与命名

- 路径：`docs/action-authoring-src/references/step-modules/authored/<id>.md`
- `<id>` = `sys:<id>` 去前缀，与 `buildRefId()` 一致（如 `sys:excelreadwrite` → `excelreadwrite`）
- 登记：`scripts/analyze-step-module-ref-redundancy.mjs` → `AUTHORED`；跑 `npm run docs:modules:analyze` 更新 `step-module-skip.json`
- ref 读取不变：`docs_get_reference({ topic: "step-modules", file: "<id>" })`

## 3. 文档结构（固定顺序）

```markdown
# sys:<key>

> **分类**：<分类中文> · **来源**：仓库手写 · **官方**：[<slug>](<kc-url>)

**用途**：<一行中文，动作设计语境>

**何时读**：<一行：读完 get 后仍不清楚什么时再读；或「不必读，get 即可」>

## wire 要点

| param | wire | notes |
|-------|------|-------|
| ... | inline / `.file` / `.var` / 表达式 | 仅非显而易见项 |

## 模式（可选）

controlField 或多「操作类型」分支：表格或 bullet，**只写各分支差异**。

## 协议 / 格式（可选）

DSL、HTTP 体、表单定义、Excel 范围等 get 未展开的格式；用表格或短代码块。

## 禁止 / 常见错误（可选）

| 写法 | 问题 |
|------|------|

## 示例（推荐）

最小单步 patch JSON（`stepRunnerKey` + `inputParams` / `outputParams`）；≤22 行。`inputParams` 按 `valueType` 选 JSON 形态：List→`["a","b"]`，Dict→`{…}`，Boolean/Number→bool/number 或 string，`$$`/`$=` 须 string。**只写非默认参数**；`.var` / `.file` / 含 `$` 的 string 始终保留。

压缩已有示例：`node scripts/compress-module-ref-examples.mjs`（需 qkrpc）。

可从 [QuickerModuleDoc](https://github.com/PassWordE/QuickerModuleDoc/blob/main/Doc.md) 蒸馏（自动省略默认值）：

```bash
node scripts/distill-quicker-module-doc-examples.mjs --input path/to/Doc.md
```

蒸馏块带 `<!-- QuickerModuleDoc examples -->` 标记，可重复执行覆盖。

## 语法检查（可选）

仅当本仓库有专用 diagnostics（如 `INPUT_SCRIPT_*`）时保留；列 code + 一行含义。

## 相关

<3–6 个 topic/ref，空格分隔 · 连接>
```

### 3.1 元信息行

- **分类**：与 `_catalog.md` 一致（程序流控制、网络与云服务…）
- **来源**：固定「仓库手写」
- **官方**：保留 KC slug 链接，便于人工核对

### 3.2 篇幅档位（目标行数，含空行）

| 档位 | 行数 | 适用 | 必有节 |
|------|------|------|--------|
| **S** | 20–35 | 单模式、无外链协议（`enc`、`smtp`、`record`） | 用途、何时读、wire 要点、相关 |
| **M** | 35–55 | 多 controlField / 多操作类型（`http`、`fileOperation`） | + 模式、示例 |
| **L** | 55–90 | 重协议 / 外链大段正文（`csscript`、`excelreadwrite`、`inputScript`） | + 协议；lint 按需 |
| **XS（schema-backed）** | 15–30 | 已有 schema topic（`form-spec`、`webview2-authoring`） | 何时读 → schema；仅示例 + 相关 |
| **XL** | 90+ | **避免**；应拆到 `action-project-files`、独立 schema topic 或子 reference |

硬上限：**100 行**（超则删冗余或外置到 `schemas/`）。

### 3.3 schema-backed 模块

`schemas/*.md` + `guide get --topic <schema>` 已覆盖协议时，step-modules reference **禁止**重复 wire/模式表或内联大段 `formDef`/HTML。只保留：一行「何时读」指向 schema、1–3 个单步 JSON 示例（优先 `*.file`）、相关节。蒸馏 Doc 时跳过 `SCHEMA_BACKED`（见 `distill-quicker-module-doc-examples.mjs`）。

## 4. 压缩规则（从 KC 爬取稿提炼）

### 保留

- `controlField` /「操作类型」各分支的**互斥参数**与默认值陷阱
- wire 写法：`.file`、`.var`、多行文本、词典/列表 JSON 形状
- 与其它步骤/变量的**耦合**（如 http 的 Content-Type 与请求体类型）
- 必须外链的文件扩展名、路径约定（指向 `action-project-files`）
- Agent 易错点（表达式误用、SendKeys 花括号、子程序 `callIdentifier`）
- 本仓库 **diagnostics code**（若已实现）

### 删除

- 与 `step-runner get` 的 `purpose` **同义**的参数段落（【网址】【方法】…）
- 概述、营销式列举、键盘快捷键、版本史、「详见下文」类空话
- 官方截图占位、共享动作推广链接（除非无替代且关键）
- 完整算法列表改为一行枚举（如加密算法名）

### 用语

- 表头 `param` 用 **wire 键名**（`data`、`formDef.file`），不用 Quicker UI 中文名
- notes 用英文或中文短句，≤80 字/格
- 禁止第二套完整参数表；用「见 get：`paramKey`」代替

## 5. `何时读` 模板

| 情况 | 写法 |
|------|------|
| 多模式必查 | `` `get` 定 `controlField` 后；写 <场景> 前读「模式」节 `` |
| 仅 wire 陷阱 | `` `get` 已够；仅在外链 `*.txt` / 表达式绑定时扫 wire 表 `` |
| 可跳过 | `` 通常不必读；`get` + `expressions` 即可 `` |

## 6. 从爬取稿迁移步骤

1. 读 `../<id>.md`（KC 素材）+ `qkrpc step-runner get --key sys:<key> --json`
2. 按本规范起草 `authored/<id>.md`，对照档位压行
3. 将 `sys:<key>` 加入 `AUTHORED`，从 `FORCE_KEEP` 移除
4. `npm run docs:modules:analyze` → `docs:gen:force` → 验证 `docs_get_reference`
5. **丙（过渡期）**：手写落地后立即删除 `../<id>.md`；`authored` 与 KC 爬取不并存同一 id

## 7. 质检清单

- [ ] 无整段复述 get 已有 purpose
- [ ] wire 表仅非显而易见项（通常 3–8 行）
- [ ] 示例 JSON 可 `patch` 落地（键名与 get 一致）
- [ ] 行数 ≤ 档位上限
- [ ] `相关` 含 `step-runner-get`；复杂模块含 `implementation-fallback`
- [ ] 有专用 lint 的模块含「语法检查」节（code 与实现一致）

## 8. 示例档位

- **S**：`enc.md` — 算法枚举一行 + 输入类型（文本/Base64/HEX）wire
- **M**：`http.md` — 按 GET/POST 分请求体类型表，不抄【网址】说明
- **L**：`inputScript.md` — DSL + `INPUT_SCRIPT_*`（已符合本规范）
