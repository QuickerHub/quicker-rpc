# step-module authored 文档 → examples 改造

> 日期：2026-06-10  
> 状态：已批准执行

## 问题

- 44 个 `authored/<id>.md` 多为空壳 wire 表（20 个零 JSON 示例），Agent 无法从 reference 学到如何写步骤。
- 同 id 的 `kc/<id>.md` 全文与 authored 并存，违反 SPEC §6.5「每模块一个文档」。
- `generate-step-module-refs.mjs` 仍爬取 authored 模块，浪费且会再生重复稿。

## 目标

1. **每模块一个文档**：保留 `authored/<id>.md`，删除对应 `kc/<id>.md`；生成脚本永久跳过 authored key。
2. **examples 为主**：参考 KC 官方全文 + `qkrpc step-runner get`，写出足够且正确的压缩 step JSON 示例。
3. **覆盖全部 44 个 authored 模块**；进度可机器续跑（loop / progress 文件）。

## 非目标

- 不重写 skip 列表 ~100 个「仅 get」模块的 KC 爬取策略（另任务）。
- 不在 reference 内复述 get 已有 purpose 参数表。
- 不提交含真实密钥的示例（用 `{AccessKey}` 占位）。

## 新文档结构

```markdown
# sys:<key>

> **分类**：… · **来源**：仓库手写 · **官方**：[slug](kc-url)

**用途**：一行

## 示例

### <场景>
```json
{ "stepRunnerKey": "sys:…", "inputParams": { … }, "outputParams": { … } }
```

## 陷阱（可选，≤3 行）
## 相关
```

### 示例规则

| 规则 | 说明 |
|------|------|
| 键名 | 与 `step-runner get` 的 `inputParams` / `outputParams` 一致 |
| 压缩 | 省略 schema 默认值；`$$`/`$=`/`.var`/`.file` 保留 |
| 类型 | List→`[]`，Dict→`{}`，表达式 string 用 `$$…` 或 `$=…` |
| 数量 | 单模式 2–3；多 controlField 每主分支 1–2；复杂模块 5–8 |
| 来源 | KC 全文场景 + 已有 QuickerModuleDoc 蒸馏块（保留并改写标题） |
| 校验 | `node scripts/compress-module-ref-examples.mjs`（需 qkrpc） |

## 批次划分（44 模块）

| 批 | 模块数 | 档位 |
|----|--------|------|
| 0 | — | 基础设施（脚本、SPEC、progress） |
| 1 | 8 | XS 第三方/脚本壳 |
| 2 | 10 | S 单模式网络/工具 |
| 3 | 12 | M 提取/表/图片 |
| 4 | 8 | M+ UI/自动化 |
| 5 | 6 | L 重协议 |

## 完成定义

- [ ] `.examples-progress.json` 中 44 项均为 `done`
- [ ] 对应 `kc/<id>.md` 已删除
- [ ] `npm run docs:modules:analyze` + `docs:modules:gen` + `docs:gen` 通过
- [ ] 每篇 authored ≥ 档位要求的 JSON 示例数

## 风险

- 无 qkrpc 时无法自动 compress → 手工对照 get 键名，后续补跑 compress。
- `inputScript` / `chromecontrol` 等大模块单次上下文压力大 → 拆为批 5 末两项单独 loop tick。
