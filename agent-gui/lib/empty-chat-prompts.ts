export type EmptyChatPrompt = {
  id: string;
  /** Short label on the chip */
  label: string;
  /** One-line summary shown on the card */
  hint: string;
  /** Full text sent to the agent */
  text: string;
};

/** Starter prompts on empty chat (action authoring). */
export const EMPTY_CHAT_ACTION_PROMPTS: readonly EmptyChatPrompt[] = [
  {
    id: "clipboard-json-format",
    label: "剪贴板 JSON 格式化",
    hint: "校验 JSON，合法则缩进写回，否则只展示错误",
    text: "写一个动作：读取剪贴板文本；若是合法 JSON 则格式化（缩进 2 空格）并写回剪贴板，否则在文本窗口显示解析错误原因，不修改剪贴板",
  },
  {
    id: "window-vscode-or-tip",
    label: "VS Code 条件最大化",
    hint: "按前台窗口标题分支：最大化或提示",
    text: "写一个动作：获取前台窗口标题；若标题包含「Visual Studio Code」则将该窗口最大化，否则弹出提示「当前不是 VS Code 窗口」",
  },
  {
    id: "clipboard-lines-dedupe",
    label: "剪贴板行去重排序",
    hint: "按行去空、去重、排序后写回并反馈行数",
    text: "写一个动作：读取剪贴板文本，按行拆分后去除空行、去重、按字母序排序，再用换行符拼接写回剪贴板，并在提示中显示处理前后的行数",
  },
  {
    id: "downloads-sort-by-ext",
    label: "下载夹按类型归档",
    hint: "近 7 天文件按扩展名归类，移动前确认",
    text: "写一个动作：扫描用户「下载」文件夹中过去 7 天内修改过的文件，按扩展名移动到子文件夹（pdf、jpg、png、zip、other）；移动前用表单列出将要移动的文件数量并请用户确认",
  },
  {
    id: "form-to-markdown-clipboard",
    label: "表单生成 Markdown",
    hint: "多字段表单收集后输出任务清单到剪贴板",
    text: "写一个动作：弹出多字段表单，收集「标题、标签（逗号分隔）、优先级（高/中/低）、备注」；确认后以 Markdown 任务清单格式写入剪贴板",
  },
  {
    id: "clipboard-watch-log",
    label: "监听剪贴板写日志",
    hint: "等待剪贴板变化，追加带时间戳到桌面日志",
    text: "写一个动作：等待剪贴板文本内容改变（最多 30 秒，期间显示等待窗口），捕获到新内容后追加写入桌面 clip-log.txt（带时间戳前缀）；超时则提示未检测到变化",
  },
] as const;
