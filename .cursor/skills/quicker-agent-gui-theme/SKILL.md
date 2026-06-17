---
name: quicker-agent-gui-theme
description: >-
  When adding or editing agent-gui UI (components, CSS, action-editor param editors,
  dialogs, code blocks), default to theme-adaptive styling — use design tokens, not
  hardcoded light/dark colors. Use when creating new React UI, CSS classes, popups,
  or fixing contrast issues in dark/light mode.
disable-model-invocation: false
metadata:
  internal: true
---

# agent-gui 主题适配（默认必做）

## 铁律

在 **agent-gui** 新增或修改可见 UI（组件、CSS、弹窗、内联 `style`）时，**默认**按深浅主题可切换来设计，**不要**假设用户只在浅色或只在深色下使用。

**禁止**（除非 token 文件中明确定义）：

- 写死 `#fff` / `#000` / `#f4f4f4` / `#666` 等作为**背景、正文、边框**主色
- 只在一个主题下目测通过就宣布完成

**必须**：

- 用现有 **CSS 变量**；新语义色若缺失，在主题文件里**成对**补 dark + light
- 参考同目录已有控件的 class（`rg` 邻近组件），保持与周边一致
- 改完 UI 后走 `quicker-agent-gui-frontend`（`dev_frontend_check`）；有精力时在应用内切换深/浅主题扫一眼

## 用哪套 token

| 区域 | 主题文件 | 变量前缀 | 典型用途 |
|------|----------|----------|----------|
| 主聊天、设置、通用壳 | `agent-gui/app/theme.css` | `--bg`、`--text`、`--muted`、`--accent`、`--md-code-bg`… | 聊天气泡、工具卡、Markdown、Composer |
| 动作设计器 action-editor | `agent-gui/components/action-editor/action-editor-theme.css` | `--ad-bg-*`、`--ad-fg-*`、`--ad-border-*` | 步骤列表、StepEditorPopup、参数编辑器、枚举下拉 |
| 动作设计器样式 | `agent-gui/components/action-editor/action-editor.css` | 上表 `--ad-*` | 新 class 写在这里，**不要**在组件里散落 hex |

切换方式：`html[data-theme="dark"|"light"]`（见 `lib/action-editor/shared/ThemeContext.tsx`、`components/ThemeProvider.tsx`）。

## action-editor 常用 token（复制即用）

```css
/* 输入 / 代码块 / 只读 wire 展示 */
background: var(--ad-bg-input);
border: 1px solid var(--ad-border-input);
color: var(--ad-fg-input);

/* 面板、弹窗 */
background: var(--ad-bg-panel);
border: 1px solid var(--ad-border-panel);
box-shadow: var(--ad-shadow-popup);
color: var(--ad-fg-primary);

/* 次要说明、summary */
color: var(--ad-fg-param-hint);   /* 字段下 hint */
color: var(--ad-fg-hint);         /* 更弱说明 */

/* 成功态文案（如按键摘要） */
color: var(--ad-fg-success);

/* 遮罩 */
background: var(--ad-backdrop-popup);

/* 强调 / 选中 / 混色 */
background: color-mix(in srgb, var(--ad-accent) 12%, var(--ad-bg-panel));
border-color: color-mix(in srgb, var(--ad-fg-warn-soft) 55%, var(--ad-border-strong));
```

**对照实现**（改前先看）：

- 代码块：`text-tool-dialog-key-preview`、`.keyboard-param-wire-code`
- 输入框：`.step-param-control`、`.step-param-expression-editor`
- 弹窗：`text-tool-dialog-*`、`key-input-select-dialog`

## 主应用（非 action-editor）

优先 `theme.css` 中已有变量，例如：

- 表面：`--panel`、`--bg`、`--composer-input-bg`
- 文字：`--text`、`--muted`
- 代码：`--md-code-bg`、`--code-text`
- 状态：`--ok`、`--err`、`--warn`

## 新增 token 时

1. 在 `action-editor-theme.css`（或 `theme.css`）的 **`:root` / `html[data-theme="dark"]` 与 `html[data-theme="light"]` 两段都写**
2. 命名跟现有 `--ad-*` 语义（`bg-` / `fg-` / `border-`），勿引入第三套命名
3. 组件 CSS 只引用变量，不写 hex fallback（`var(--ad-fg-input)` 即可，主题文件保证定义）

## 工作流（与前端检查衔接）

```
新增 UI 组件 / CSS
  → 选 token 表（action-editor vs 主应用）
  → 对照邻近已有 class
  → 避免硬编码色
  → dev_frontend_check 直到 ok
  → （建议）切换深/浅主题目视确认对比度
```

## 相关

- 前端自动检查：`quicker-agent-gui-frontend` / `/frontend-check`
- 动作设计器字段：`quicker-action-designer-ui`
- 约定：`agent-gui/AGENTS.md`
