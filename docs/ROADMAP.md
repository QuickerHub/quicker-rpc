# QuickerAgent 路线图

愿景：长在 Quicker 旁边的 AI 副驾 — `Alt+Space` 秒开，找 / 跑 / 改 / 发动作；长期演进到 Quicker Studio。

产品说明见 [quicker-agent.md](quicker-agent.md)。

---

## P0 当前冲刺 — 启动器 + 语音（进行中）

- [ ] 启动器文案与边界测试（删动作 → 自动打开回收站等）
- [ ] 全局快捷键稳定（Alt+Space 注册 / 同步 / 单测）
- [ ] 语音输入 + LLM + TTS 播报闭环
- [ ] Alt+Space 按住录音、松开 Space 触发 Agent（与「唤起即开麦」二选一或组合）

---

## P1 近期 — Agent 核心能力

### 知识与工具

- [ ] 全模块文档；重要模块单独沉淀知识（HTTP、脚本、record 等）
- [ ] 场景 Skills：authoring / run / publish / settings 快速跳转
- [ ] qkrpc MCP 能力补全 + 对外文档（方便 Cursor / 第三方 Agent）
- [ ] 调试 log 模块注入，长链路可追溯

### 体验与发布

- [ ] 一键修改 Quicker 设置（Launcher intent 覆盖补全）
- [ ] 长结果终端读取优化（截断 / 分页 / 摘要）
- [ ] Agent 发布动作引导 → getquicker 共享库

### 质量

- [x] Agent 任务测试集：[`agent-authoring-benchmark.md`](agent-authoring-benchmark.md) + `agent-gui/benchmarks/authoring-tasks.json`（24 条，手动评测就绪）
- [x] 明确评测维度：六轴 A–F（规划 / 选型 / 检索 / 实现 / 流程 / 可运行）
- [ ] Benchmark 接 `/tool-test` Agent E2E 与 trace 半自动打分

---

## P2 中期 — 触发与自动化

- [ ] Action trigger：直接配置 trigger 数据，条件满足自动触发
- [ ] web-monitor → trigger → action（一键继承）
- [ ] web-trigger → action → 通知用户（sendMessage）
- [ ] 消息快速回复 Agent（少人工构思回复）

---

## P3 中期 — 界面扩展与浏览器

- [ ] WebView 快速交互界面（降低 WebView 使用门槛）
- [ ] 浏览器控制能力（Quicker 化身浏览器自动化助手）
- [ ] 前端开发能力（Agent 写 / 改简单前端并预览）
- [ ] Quicker 脚本形式调用 + 一键转脚本
- [ ] AI 动作审核（发布前自动检查，减人工审核）
- [ ] Agent 搜索结果优化（可选：给用户多个选项自选）

---

## P4 远期 — 平台化（Quicker Studio）

- [ ] 大型动作项目重构（多动作、子程序、批量 patch）
- [ ] 脚本引擎（优先于工作流模块；脚本为一等公民）
- [ ] 独立动作执行引擎（不依赖 Quicker，需加密 / 授权）
- [ ] Quicker Studio（编辑器 + 脚本 + 调试 + 发布）

依赖：P3 转脚本 → P4 脚本引擎 → 独立执行 → Studio

---

## P5 探索（不阻塞主线）

- 全能桌面语音助手 + 设备互联
- 可学习 Agent 自主进化、控制 Cursor 干活
- 发帖子也用 Agent 做
- 「1 天 100 万行代码」→ 降为高吞吐 authoring 基准，挂 P1 测试集

---

## 已完成 / 已有基础

- [x] Agent 聊天助手（QuickerAgent 主产品，见 [quicker-agent.md](quicker-agent.md)）
- [x] 启动器架构（Alt+Space、临时会话、LAUNCHER_TOOL_IDS，见 [agent-gui-launcher.md](agent-gui-launcher.md)）
- [x] 语音输入基础设施（voice-input-tauri、voice-plugin）

---

## 建议下一步（2–4 周）

1. 收尾 P0：快捷键测试 + 语音→TTS 最小闭环
2. 按住 Space 录音 / 松开触发
3. 建 5–10 条 Agent 评测任务
4. 补场景 Skills + qkrpc MCP 文档
5. 发布引导 MVP
