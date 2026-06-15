import type {
  TitleTestExample,
  TitleTestExampleGroup,
} from "@/lib/tool-test-title-examples";

/** Main-chat composer: challenging action-authoring prompts for agent stress-testing. */
export const COMPOSER_TEST_PROMPT_GROUPS: readonly TitleTestExampleGroup[] = [
  {
    id: "new-action",
    label: "新建动作",
    examples: [
      {
        id: "new-clipboard-csv-stats",
        label: "剪贴板 · CSV 聚合",
        description: "解析 + 列求和 + 分支提示",
        userText:
          "新建动作：剪贴板内容是 CSV（第一行表头）。统计数据行数，对名为 amount 的列求和；若该列不存在则弹窗说明。最后把「行数,合计」写回剪贴板。",
      },
      {
        id: "new-conditional-http",
        label: "HTTP · 条件请求",
        description: "if 分支 + GET + 变量",
        userText:
          "新建动作：变量 url（文本，默认空）。若 url 非空则 GET 该地址并把响应体写入 body；否则提示「请先设置 url」。有 url 时用文本窗口显示 body 前 200 字符。",
      },
      {
        id: "new-window-vscode-branch",
        label: "窗口 · 标题分支",
        description: "取标题 + if/else + 窗口操作",
        userText:
          "新建动作：读取前台窗口标题存入 title。若 title 包含 Visual Studio Code 则最大化该窗口；否则弹窗「当前不是 VS Code：」并附上 title。",
      },
      {
        id: "new-json-clipboard-external-cs",
        label: "剪贴板 · JSON 外置表达式",
        description: "校验 + 格式化 + files/*.eval.cs",
        userText:
          "新建动作：读剪贴板到 raw。若是合法 JSON 则格式化（缩进 2 空格）写回剪贴板；否则弹窗报错。格式化逻辑若超过 4 行请放到 files/format-json.eval.cs 并在步骤里用文件引用。",
      },
    ],
  },
  {
    id: "edit-action",
    label: "修改动作",
    examples: [
      {
        id: "patch-read-structure-then-add",
        label: "先读结构 · 再追加",
        description: "structure → patch 增步",
        userText:
          "先告诉我工作区里任意一个非空动作有几步、各是什么 stepRunnerKey；确认后在末尾加一步 sys:evalexpression，读剪贴板行数写入 lineCount 并弹窗显示。",
      },
      {
        id: "patch-rpc-test-if-else",
        label: "_rpc_test · 条件双分支",
        description: "sys:if + 两路提示",
        userText:
          "在 _rpc_test 第 1 步后用 sys:evalexpression 读剪贴板行数到 lineCount，再插 sys:if：条件 $={lineCount}>0，if 分支弹「有 {lineCount} 行」，else 分支弹「剪贴板为空」。",
      },
      {
        id: "patch-action-tag-loop",
        label: "@ 引用 · 加循环统计",
        description: "action-tag + loop + 表达式",
        userText:
          '<qkrpc-action-tag data-id="e0ac442e-6241-4f89-9a20-494dee157b89" data-title="剪贴板去重"></qkrpc-action-tag> 在该动作末尾加 loop：对剪贴板按行遍历，用 evalexpression 累计非空行数到 nonEmpty，循环结束后弹窗显示 nonEmpty。',
      },
    ],
  },
  {
    id: "advanced",
    label: "进阶",
    examples: [
      {
        id: "form-markdown-clipboard",
        label: "sys:form · Markdown 清单",
        description: "多字段表单 + 格式化写剪贴板",
        userText:
          "新建动作：用 sys:form 收集标题、标签（逗号分隔）、优先级（高/中/低）、备注；确认后用 evalexpression 格式化成 Markdown 任务清单写入剪贴板，并弹窗「已复制」。formDef 外置到 files/task.form.json。",
      },
      {
        id: "file-copy-timestamp-local",
        label: "文件 · 带时间戳复制",
        description: "选择文件 + fileoperation + 表达式命名",
        userText:
          "新建动作：让用户选一个文件，复制到当前工作目录 .local/ 下，目标文件名在原 basename 后加 _yyyyMMdd_HHmmss 再保留扩展名。复制成功后弹窗显示新路径。",
      },
      {
        id: "subprogram-run-then-expr",
        label: "子程序 · 调用后处理",
        description: "subprogram search/get + sys:subprogram + evalexpression",
        userText:
          "新建动作：subprogram search 找名称含 Run 的公共子程序，get 后选最合适的一个用 sys:subprogram 调用；调用完成后再加 evalexpression 把 {subProgramResult} 的行数写入 n 并列表显示。",
      },
    ],
  },
] as const;

export const COMPOSER_TEST_PROMPTS: readonly TitleTestExample[] =
  COMPOSER_TEST_PROMPT_GROUPS.flatMap((g) => g.examples);
