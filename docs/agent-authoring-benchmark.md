# QuickerAgent 动作编写 Benchmark

用于评估 Agent **分析、规划、选型、检索、实现、流程遵守、可运行性**。任务以**自然语言**发出，不要在 prompt 里写工具名。

**数据源**：[`agent-gui/benchmarks/authoring-tasks.json`](../agent-gui/benchmarks/authoring-tasks.json)  
**代码**：[`agent-gui/lib/authoring-benchmark.ts`](../agent-gui/lib/authoring-benchmark.ts)

---

## 快速开始（手动评测）

1. 启动 `pwsh ./dev.ps1`，确认 Quicker + 插件已加载。
2. 新开 Agent 线程，从 JSON 或下表复制 **`userPrompt`**（仅用户话术）。
3. 等 Agent 完成后，按 [评分](#评分) 填分表。
4. 对需要运行的任务，在 Quicker 中手动执行或使用 `action_debug`。

建议首轮跑 **L2 主干**（`tier: L2` 且 `category: authoring`）共 7 条，再看 L0/L3/L4。

---

## 评测维度（轴）

| 轴 | 名称 | 权重 | 含义 |
|----|------|------|------|
| A | 规划 | 20% | 步骤分解、变量数据流 |
| B | 选型 | 20% | expression / module / script |
| C | 检索 | 15% | search → get，键名与 controlField |
| D | 实现 | 15% | patch 成功、逻辑接通 |
| E | 流程 | 15% | 禁 patch 后 get、禁内联 patch JSON 等 |
| F | 可运行 | 15% | 跑通、输出符合预期 |

每条任务只评其 `axes` 列出的维度。每轴：**0** 失败 · **1** 部分 · **2** 达标。

**通过线**（默认）：已评任务总分 ≥ **70%**，且 L2 主干（`tier=L2` 且非纯 regression）≥ **60%**。

---

## 任务清单

### L0 发现（只读）

| id | 用户 prompt |
|----|-------------|
| `discover-clipboard-actions` | 帮我找一下 Quicker 里和剪贴板相关的动作，用几句话说明大概找到几个、最相关的 3 个叫什么。 |
| `discover-step-expr` | 我想对剪贴板里的文本按行去重并排序，应该用哪种 Quicker 步骤？请查清楚后列出与表达式/输出相关的参数键名，不要猜。 |
| `discover-docs-workflow` | 从零新建一个 Quicker 动作并保存，大致要经过哪些阶段？用 5 条以内的要点说明即可。 |
| `discover-subprogram-uses` | 有哪些动作调用了公共子程序 QuickerRpc_Run？文字总结动作名称和 id 即可。 |
| `org-docs-organization` | 我想整理 Quicker 动作页：移动动作到别的标签页、新建空白页、按子程序归集动作，分别该怎么做？各用一句话说明即可。 |

### L1 单步 / 元数据

| id | 用户 prompt |
|----|-------------|
| `meta-create-icon` | 新建一个测试动作，标题「_agent_benchmark_meta」，说明写「benchmark 元数据测试」，选一个合适的浅色 FontAwesome 图标写上。不要添加任何步骤。 |
| `meta-rename-only` | 把工作区里任意一个已有动作的标题改成「_benchmark_rename_<当前分钟>」，不要改步骤内容。 |
| `single-msgbox` | 新建一个动作，运行后只弹出一句「Hello from benchmark」。 |

### L2 主干（优先跑）

| id | 用户 prompt | 陷阱 |
|----|-------------|------|
| `clip-lines-expr` | 做一个动作：读取剪贴板文本，去掉空行、按行去重、按字母序排序后写回剪贴板，并提示处理前后的行数。 | 禁 csscript 主逻辑 |
| `multi-var-assign` | 新建动作：用一个表达式步骤同时设置 a=1、b=2、c=a+b，最后用文本窗口显示 c 的值。 | 单步多 `{var}=` |
| `http-json-origin` | 做一个动作：请求 https://httpbin.org/get ，从返回的 JSON 里取出 origin 字段，在文本窗口里显示。 | 需网络 |
| `window-vscode-branch` | 做一个动作：读取前台窗口标题；如果标题里包含 Visual Studio Code，就把该窗口最大化；否则弹出提示「当前不是 VS Code」。 | 需 else 用 if |
| `form-to-clipboard` | 做一个动作：先弹出表单收集「标题、标签（逗号分隔）、优先级（高/中/低）、备注」，确认后把内容格式化成 Markdown 任务清单写入剪贴板。 | form get |
| `file-copy-timestamp` | 做一个动作：让用户选一个文件，复制到当前工作目录下的 .local/ 文件夹，文件名加上时间戳后缀再保存。 | fileOperation |
| `read-structure-first` | 先告诉我工作区里任意一个非空动作有几步、分别是什么类型的步骤；然后在末尾加一步「读取剪贴板到变量 clip」。 | 先 structure |

### L2 流程回归

| id | 用户 prompt |
|----|-------------|
| `delay-step` | 给工作区里已有的某个动作在末尾加一步：延迟 500 毫秒（或等价的等待）。 |
| `regression-no-get-after-patch` | 把任意已有动作的标题改成「_patch_no_get_<当前分钟>」，只改标题，不要动步骤。改完不要再去全量同步核对。 |
| `regression-no-inline-patch-json` | 给已有动作加一步「延迟 500 毫秒」。请通过改磁盘上的 data.json 再保存，不要把步骤 JSON 直接传给 patch 接口。 |

### L3 工作区 / 子程序

| id | 用户 prompt |
|----|-------------|
| `external-eval-cs` | 做一个动作：读取剪贴板文本，若是合法 JSON 则格式化（缩进 2 空格）写回剪贴板，否则弹出错误说明。表达式若超过 4 行，请放到 files/ 下的 .eval.cs 并在步骤里用文件引用。 |
| `file-edit-comment` | 如果工作区里有动作使用了 files/ 下的 .cs 或 .eval.cs，请在其中加一行英文注释说明「benchmark touch」，然后保存回 Quicker。若没有这种文件，先建一个带外置表达式文件的动作再演示。 |
| `global-subprogram-call` | 新建或编辑一个测试动作，增加一步调用公共子程序 QuickerRpc_Run（或你搜到的 Run 相关子程序）。 |

### L4 复杂

| id | 用户 prompt |
|----|-------------|
| `csv-clipboard-stats` | 做一个动作：剪贴板内容是 CSV（第一行表头）。统计数据行数，并对名为 amount 的列求和（若列不存在则提示），把「行数,合计」写回剪贴板。 |
| `conditional-http-cache` | 做一个动作：若动作变量 url 非空则 GET 该 url 并把响应体存入变量 body，否则提示用户先设置 url。 |

完整 rubric（must / should / mustNot）见 JSON 文件。

---

## 评分

### 打分表（复制到表格）

```text
task id | tier | A | B | C | D | E | F | % | notes
```

未考查的轴填 `—`。`%` 可按 `scoreAuthoringBenchmarkTask` 加权计算，或手算：(各轴分/2×权重) 之和。

### 汇总

| 指标 | 计算 |
|------|------|
| 总分 | 已评任务 `task %` 的算术平均 |
| L2 主干 | `clip-lines-expr` … `read-structure-first` 等 7 条平均 |
| 通过 | 总分 ≥70% 且 L2 主干 ≥60% |

---

## 半自动检查（可选）

从会话 tool trace 粗查：

| 检查 | 失败信号 |
|------|----------|
| 禁 csscript（`clip-lines-expr`） | patch 前 data 含 `sys:csscript` 作主变换 |
| 禁 patch 后 get | patch 后又 `action_get` / `read_data` full |
| 禁内联 patch | `patch` 参数含内联 `steps` |
| get 在写前 | 无 `step_runner_get` 就出现含 `inputParams` 的 patch |

---

## 与路线图

对应 [ROADMAP.md](ROADMAP.md) P1「Agent 任务测试集」。后续可接 `/tool-test` Agent E2E suite 与 `action_debug` 自动断言。

---

## 维护

- 新增任务：编辑 `authoring-tasks.json`，保持 `userPrompt` 为自然语言。
- 跑单测：`cd agent-gui && pnpm exec tsx --test lib/authoring-benchmark.test.ts lib/empty-chat-prompts.test.ts`
