import type {
  TitleTestExample,
  TitleTestExampleGroup,
} from "@/lib/tool-test-title-examples";

/** Main-chat composer: moderately complex action-authoring prompts only. */
export const COMPOSER_TEST_PROMPT_GROUPS: readonly TitleTestExampleGroup[] = [
  {
    id: "new-action",
    label: "新建动作",
    examples: [
      {
        id: "new-clipboard-dedupe",
        label: "剪贴板 · 去重排序",
        description: "多步 + 变量 + 提示",
        userText:
          "新建动作：读剪贴板文本，按行去重、排序后写回，用变量记录处理前后行数，最后弹窗显示 before/after。",
      },
      {
        id: "new-file-wordfreq",
        label: "文件 · 词频 Top10",
        description: "fileoperation + evalexpression",
        userText:
          "新建动作：变量 path 默认空，第一步用 sys:fileoperation 读文本文件到变量 content；第二步 sys:evalexpression 统计词频取前 10 行写入 result；第三步把 result 写回剪贴板。",
      },
      {
        id: "new-urls-default-file",
        label: "变量 · 外置默认值",
        description: "defaultValue.file + 表达式",
        userText:
          "新建动作：变量 urls 用 defaultValue.file 指向 files/urls-default.txt（多行 URL），第一步 evalexpression 过滤空行并赋值 count、body，第二步提示框显示行数。",
      },
      {
        id: "new-window-paste",
        label: "窗口 · 复制粘贴链",
        description: "鼠标键盘 + 变量",
        userText:
          "新建动作：变量 sel 存选中文本。先模拟复制到 sel，若 sel 非空则激活记事本窗口并 Ctrl+V 粘贴；否则提示「无选中」。",
      },
    ],
  },
  {
    id: "edit-action",
    label: "修改动作",
    examples: [
      {
        id: "patch-rpc-test-lines",
        label: "_rpc_test · 加统计步骤",
        description: "patch 已有夹具动作",
        userText:
          "在 _rpc_test 里加两步：先用 sys:evalexpression 读剪贴板行数写入 lineCount，再用用户提示显示处理前后行数对比。",
      },
      {
        id: "patch-if-branch",
        label: "加条件分支",
        description: "sys:if + $= 条件",
        userText:
          "在 _rpc_test 第 1 步后插入 sys:if：条件 $={lineCount}>0，if 分支弹窗「有内容」，else 分支弹窗「剪贴板为空」。",
      },
      {
        id: "patch-action-tag",
        label: "@ 引用动作 · 补步骤",
        description: "带 qkrpc-action-tag 的修改需求",
        userText:
          '<qkrpc-action-tag data-id="e0ac442e-6241-4f89-9a20-494dee157b89" data-title="剪贴板去重"></qkrpc-action-tag> 在这个动作末尾加一步 sys:evalexpression，把 {lineCount} 加 1 写回 lineCount。',
      },
    ],
  },
  {
    id: "advanced",
    label: "进阶",
    examples: [
      {
        id: "subprogram-search-call",
        label: "公共子程序 · 搜索调用",
        description: "search + sys:subprogram",
        userText:
          "新建动作：用 subprogram search 找名称含「剪贴板」的公共子程序，选最合适的一个，用 sys:subprogram 调用；调用后再加一步 evalexpression 把结果行数写入 n。",
      },
      {
        id: "new-sys-form",
        label: "sys:form · 多字段",
        description: "formDef.file + variables",
        userText:
          "新建动作：变量 userName、password（文本），用 sys:form（variables 模式）做登录表单，formDef 外置到 files/login.form.json，提交后弹窗显示 userName。",
      },
      {
        id: "new-dict-linq",
        label: "词典 · LINQ 过滤",
        description: "dict 变量 + evalexpression",
        userText:
          "新建动作：建词典变量 items，默认几条 key/value；用 sys:evalexpression 的 LINQ 过滤 Value 含关键字的项写入 filtered，再列表显示 filtered 的键。",
      },
    ],
  },
] as const;

export const COMPOSER_TEST_PROMPTS: readonly TitleTestExample[] =
  COMPOSER_TEST_PROMPT_GROUPS.flatMap((g) => g.examples);
