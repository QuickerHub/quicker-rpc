# step-module examples 全覆盖 v2（独立 examples/ 目录）

> **For agentic workers:** 每 tick 读 progress → `--next` → 写 `examples/<id>.md` → `mark-done`。  
> **Loop：** **持续**模式 — 先 sleep **5s** 再 tick（`pwsh scripts/run-examples-loop.ps1`）；arm 前 agent 先执行一轮，避免启动双跑；每 tick **2** 模块。

**Goal:** 为全部 **143** 个 step-runner 模块在 `references/step-modules/examples/<id>.md` 写入压缩 step JSON 示例；`kc/` 与 `authored/` **保留不动**，仅作参考素材。

**Architecture:** `init-step-module-examples-progress.mjs` 初始化进度；loop 驱动 `step-module-examples-progress.mjs`；`generate-authoring-docs.mjs` 将 `examples/` 编入 `docs_get_reference({ file:"examples/<id>" })`。

**Spec:** [examples/SPEC.md](../../action-authoring-src/references/step-modules/examples/SPEC.md)

---

## 单模块工作流

1. `qkrpc step-runner get --key sys:<key> --json`
2. 读 `kc/<id>.md`（`hasKc`）与 `authored/<id>.md`（`hasAuthored`）提取场景
3. 写 `examples/<id>.md`（结构见 SPEC；仅示例，不抄 KC 全文）
4. `node scripts/compress-module-ref-examples.mjs`（可选，qkrpc 在线）
5. `node scripts/step-module-examples-progress.mjs --mark-done <id>`

## Loop prompt

```text
续跑 step-module examples v2：读本 plan 与 .examples-progress.json；node scripts/step-module-examples-progress.mjs --next；若 ALL_DONE 则 npm run docs:gen 并停止 loop。否则对本批每模块执行「单模块工作流」；勿改 kc/ 与 authored/ 正文（除非修复明显错误）。
```

## 完成

- `.examples-progress.json`：143/143 `done`
- `npm run docs:gen` 产出 `docs/skills/.../references/step-modules/examples/*.md`
