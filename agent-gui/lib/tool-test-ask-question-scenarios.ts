import type { AskQuestionInput } from "@/lib/ask-question-tool";

export type AskQuestionScenario = {
  id: string;
  label: string;
  description: string;
  /** What the tester should verify manually. */
  checklist: string[];
  input: AskQuestionInput;
};

export const ASK_QUESTION_SCENARIOS: readonly AskQuestionScenario[] = [
  {
    id: "single-select",
    label: "单选 · 一页",
    description: "单题单选：点一项后确认提交",
    checklist: [
      "选项卡片高亮单选圆点",
      "未选时确认按钮禁用",
      "确认后消息区显示「已选择」摘要",
    ],
    input: {
      title: "选择目标页",
      questions: [
        {
          id: "page",
          prompt: "动作要放在哪一页？",
          options: [
            { id: "global", label: "全局页" },
            { id: "new", label: "新建页" },
            { id: "current", label: "当前页" },
          ],
        },
      ],
    },
  },
  {
    id: "multi-select",
    label: "多选 · 一页",
    description: "单题多选：可选多项，再确认",
    checklist: [
      "显示「可多选」标签",
      "可切换多个选项",
      "取消可清空当前选择",
    ],
    input: {
      title: "选择要同步的范围",
      questions: [
        {
          id: "scope",
          prompt: "需要同步哪些内容？",
          allow_multiple: true,
          options: [
            { id: "actions", label: "动作" },
            { id: "subprograms", label: "子程序" },
            { id: "settings", label: "设置" },
            { id: "icons", label: "图标" },
          ],
        },
      ],
    },
  },
  {
    id: "sequential-single",
    label: "连续 · 三题单选",
    description: "逐题单选：下一步 / 上一步 / 最后确认",
    checklist: [
      "进度显示 1/3、2/3、3/3",
      "第一步「取消」清空选择",
      "第二步起「上一步」可返回",
      "最后一题按钮为「确认」",
    ],
    input: {
      title: "新建动作向导",
      questions: [
        {
          id: "page",
          prompt: "放在哪一页？",
          options: [
            { id: "global", label: "全局页" },
            { id: "new", label: "新建页" },
          ],
        },
        {
          id: "mode",
          prompt: "运行模式？",
          options: [
            { id: "normal", label: "普通" },
            { id: "background", label: "后台" },
          ],
        },
        {
          id: "confirm",
          prompt: "是否立即打开设计器？",
          options: [
            { id: "yes", label: "是" },
            { id: "no", label: "否" },
          ],
        },
      ],
    },
  },
  {
    id: "sequential-mixed",
    label: "连续 · 单选 + 多选",
    description: "第一题单选，第二题多选",
    checklist: [
      "第一题确认后进入第二题",
      "第二题为多选",
      "最终摘要包含两题答案",
    ],
    input: {
      title: "发布选项",
      questions: [
        {
          id: "channel",
          prompt: "发布到哪个渠道？",
          options: [
            { id: "getquicker", label: "getquicker" },
            { id: "private", label: "私有链接" },
          ],
        },
        {
          id: "assets",
          prompt: "附带哪些资源？",
          allow_multiple: true,
          options: [
            { id: "screenshot", label: "截图" },
            { id: "intro", label: "说明页" },
            { id: "changelog", label: "更新日志" },
          ],
        },
      ],
    },
  },
];

export function getAskQuestionScenario(
  id: string,
): AskQuestionScenario | undefined {
  return ASK_QUESTION_SCENARIOS.find((s) => s.id === id);
}

export function getDefaultAskQuestionScenario(): AskQuestionScenario {
  return ASK_QUESTION_SCENARIOS[0]!;
}
