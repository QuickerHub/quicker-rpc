/** Category for grouping empty-chat agent regression / smoke prompts. */
export type EmptyChatPromptCategory =
  | "smoke"
  | "authoring"
  | "workspace"
  | "subprogram"
  | "regression"
  | "org";

export type EmptyChatPrompt = {
  id: string;
  category: EmptyChatPromptCategory;
  /** Short label on the chip */
  label: string;
  /** One-line summary shown on the card */
  hint: string;
  /** Full text sent to the agent */
  text: string;
  /** Expect no create/patch/delete (search, get, docs only). */
  readOnly?: boolean;
};

export const EMPTY_CHAT_PROMPT_CATEGORY_LABELS: Record<
  EmptyChatPromptCategory,
  string
> = {
  smoke: "冒烟（只读）",
  authoring: "编写 P1–P7",
  workspace: "工作区磁盘",
  subprogram: "子程序",
  regression: "回归约束",
  org: "整理 / 检索",
};

/** Display order for category sections in the empty-chat UI. */
export const EMPTY_CHAT_PROMPT_CATEGORY_ORDER: readonly EmptyChatPromptCategory[] =
  ["smoke", "authoring", "workspace", "subprogram", "regression", "org"];

/**
 * Agent regression prompts on empty chat.
 * Each case targets a workflow slice (overview P0–P7, workspace-editing, common errors).
 */
export const EMPTY_CHAT_ACTION_PROMPTS: readonly EmptyChatPrompt[] = [
  // --- smoke (read-only) ---
  {
    id: "smoke-action-search",
    category: "smoke",
    readOnly: true,
    label: "搜索剪贴板动作",
    hint: "P1：action_search，回复勿贴动作表",
    text: "用 qkrpc_action_query 搜索标题或说明含「剪贴板」的动作（scope 默认即可）。用一两句话总结命中数量与最相关的 3 个动作名和 id，不要输出 markdown 表格。",
  },
  {
    id: "smoke-step-runner-expr",
    category: "smoke",
    readOnly: true,
    label: "选型：表达式步骤",
    hint: "P5：search + get evalexpression",
    text: "我要用 C# 对剪贴板文本按行去重排序。请先 qkrpc_step_runner_search（query 含 表达式|evalexpression），再 qkrpc_step_runner_get key=sys:evalexpression，列出 inputParams 里与表达式/输出相关的键名（不要猜键名）。",
  },
  {
    id: "smoke-docs-authoring",
    category: "smoke",
    readOnly: true,
    label: "读 authoring 摘要",
    hint: "docs search，读 snippet",
    text: "docs search query authoring workflow P1 P7，根据 items[].snippet 用 5 条以内要点说明各阶段要调用的工具类型，不要粘贴全文。",
  },
  {
    id: "smoke-list-page",
    category: "smoke",
    readOnly: true,
    label: "列出本页动作",
    hint: "action_list + 简短摘要",
    text: "qkrpc_action_query 列出当前虚拟动作页上的动作。只文字说明数量与名称/id 要点，不要重复渲染工具返回里的表格。",
  },

  // --- authoring ---
  {
    id: "authoring-create-metadata",
    category: "authoring",
    label: "新建 + 元数据",
    hint: "P1→P3：create、fa_search、set_metadata",
    text: "新建一个测试动作，标题「_agent_gui_smoke」，说明写「空程序仅测元数据」。用 qkrpc_fa_search 选一个合适的 fa:Light_* 图标，qkrpc_action_set_metadata 写入。不要添加步骤；create 后不要 qkrpc_action_get。",
  },
  {
    id: "authoring-clip-lines-expr",
    category: "authoring",
    label: "剪贴板行处理",
    hint: "P4：必须 evalexpression，禁 csscript",
    text: "新建动作：读剪贴板文本，按行去空、去重、按字母序排序后写回剪贴板，并提示处理前后行数。数据逻辑只用 $= 或 sys:evalexpression（禁止 sys:csscript）；每步先 step-runner get。",
  },
  {
    id: "authoring-window-branch",
    category: "authoring",
    label: "窗口标题分支",
    hint: "P5：if 分支 + 窗口步骤",
    text: "新建动作：取前台窗口标题；若包含 Visual Studio Code 则最大化该窗口，否则弹出提示「当前不是 VS Code」。条件分支与窗口相关步骤均须 step-runner get 后再写入 data.json 并 patch。",
  },
  {
    id: "authoring-form-fields",
    category: "authoring",
    label: "多字段表单",
    hint: "P5：表单模块 + 写剪贴板",
    text: "新建动作：弹出表单收集「标题、标签（逗号分隔）、优先级（高/中/低）、备注」，确认后以 Markdown 任务清单写入剪贴板。表单步骤 schema 必须来自 step-runner get。",
  },
  {
    id: "authoring-http-json",
    category: "authoring",
    label: "HTTP 取 JSON",
    hint: "P5：HTTP 模块 + 表达式解析",
    text: "新建动作：用 HTTP 步骤 GET https://httpbin.org/get ，把响应体当 JSON 解析并提取 origin 字段，在文本窗口显示。HTTP 与解析步骤分别 step-runner get；解析优先 evalexpression。",
  },
  {
    id: "authoring-multi-var-assign",
    category: "authoring",
    label: "多变量赋值",
    hint: "P4：一次 evalexpression 写多变量",
    text: "新建动作：用单个 sys:evalexpression 步骤同时设置三个动作变量 a=1、b=2、c=a+b，最后文本窗口显示 c。须 step-runner get；勿拆成多个 csscript。",
  },

  // --- workspace ---
  {
    id: "workspace-external-eval-cs",
    category: "workspace",
    label: "外置 eval.cs",
    hint: "files/*.eval.cs + file 引用",
    text: "新建动作：剪贴板 JSON 校验，合法则缩进 2 空格写回，否则显示错误。表达式逻辑超过 4 行则 workspace_program file_write 到 files/clip.eval.cs，data.json 用 file 引用；改完后 workspace_program patch。",
  },
  {
    id: "workspace-edit-data-add-step",
    category: "workspace",
    label: "edit_data 增一步",
    hint: "summary → edit_data → patch",
    text: "在侧边栏工作目录中任选已有非空动作（若无则先创建一个并写入一步「显示文本」）。对该动作：workspace_program read_data mode=summary，用 workspace_program edit_data 在 steps 末尾增加一步「读剪贴板到变量 clip」，step-runner get 后再改，最后 patch。patch 后不要 action_get 全量确认。",
  },
  {
    id: "workspace-file-edit-small",
    category: "workspace",
    label: "file_edit 小改",
    hint: "file_search → file_edit",
    text: "若当前工作区有动作的 files/ 下 .eval.cs 或 .cs：用 workspace_program file_search 定位，file_read 看片段，再用 file_edit 做一处注释行小改（unique oldString），然后 patch。若没有外置文件则新建带 eval.cs 的表达式动作再演示 file_edit。",
  },

  // --- subprogram ---
  {
    id: "subprogram-call-run",
    category: "subprogram",
    label: "调用公共子程序",
    hint: "subprogram get + sys:subprogram",
    text: "新建或编辑一个测试动作，增加一步调用公共子程序 QuickerRpc_Run（或 search 到的 Run 相关子程序）：先 qkrpc_subprogram_query/get 拿 callIdentifier，再 qkrpc_step_runner_get sys:subprogram，写入步骤后 patch。禁止猜 subProgram 键名。",
  },

  // --- regression ---
  {
    id: "regression-no-get-after-patch",
    category: "regression",
    label: "patch 后勿 get",
    hint: "只改标题；信任 editVersion",
    text: "任选工作区已有动作，仅把标题改为「_patch_no_get_<当前分钟>」：用 set_metadata 或 workspace 改 info 后 patch。完成后禁止 qkrpc_action_get 或 read_data full 做确认；在回复里说明 editVersion 与为何不必 get。",
  },
  {
    id: "regression-no-inline-patch-json",
    category: "regression",
    label: "禁内联 patch JSON",
    hint: "必须改 data.json 再 patch(id)",
    text: "给已有动作增加一步「延迟 500ms」（或等价的等待/延时步骤）：只能通过 workspace_action_edit_data 改 data.json，再 qkrpc_action_patch 只传 id。禁止向 patch 传入内联 steps/op JSON。",
  },

  // --- org ---
  {
    id: "org-subprogram-uses",
    category: "org",
    readOnly: true,
    label: "谁引用了子程序",
    hint: "action_search uses:",
    text: "qkrpc_action_query 查找引用公共子程序 QuickerRpc_Run 的动作（uses: 语法见工具说明）。文字总结命中动作名与 id，不要贴表格。",
  },
  {
    id: "org-docs-organization",
    category: "org",
    readOnly: true,
    label: "整理流程要点",
    hint: "docs action-organization",
    text: "docs search query action organization move，根据 snippet 用条目说明「移动动作 / 新建 profile tab / 虚拟进程归集」各适合用哪些 qkrpc 工具（各一句），不要粘贴全文。",
  },
] as const;

export function groupEmptyChatPromptsByCategory(
  prompts: readonly EmptyChatPrompt[] = EMPTY_CHAT_ACTION_PROMPTS,
): { category: EmptyChatPromptCategory; label: string; items: EmptyChatPrompt[] }[] {
  const byCat = new Map<EmptyChatPromptCategory, EmptyChatPrompt[]>();
  for (const p of prompts) {
    const list = byCat.get(p.category) ?? [];
    list.push(p);
    byCat.set(p.category, list);
  }
  return EMPTY_CHAT_PROMPT_CATEGORY_ORDER.filter((c) => byCat.has(c)).map(
    (category) => ({
      category,
      label: EMPTY_CHAT_PROMPT_CATEGORY_LABELS[category],
      items: byCat.get(category)!,
    }),
  );
}
