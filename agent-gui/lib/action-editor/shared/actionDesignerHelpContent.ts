export type ActionDesignerHelpSection = {
  title: string;
  lines: string[];
};

/** Mirrors Quicker ActionDesignerViewModel.ShowKeyboardHints; scoped to QuickerAgent web editor. */
export const ACTION_DESIGNER_HELP_SECTIONS: ActionDesignerHelpSection[] = [
  {
    title: "编辑器",
    lines: [
      "可视化：编辑 data.json 中的步骤与变量；修改后点「保存到工作区」写入磁盘。",
      "源码 JSON：查看或编辑 data.json 及关联源文件（只读预览大文件时可能截断）。",
      "交互习惯对齐 Quicker 桌面动作设计器（ActionDesignerWindow）。",
      "",
      "F1：显示本说明；",
      "Ctrl+Z：撤销；",
      "Ctrl+Y / Ctrl+Shift+Z：重做；",
      "步骤与变量共用一条撤销/重做历史。",
    ],
  },
  {
    title: "步骤列表",
    lines: [
      "双击步骤：打开步骤编辑弹窗；",
      "↑ / ↓：切换选中步骤；",
      "← / →：在容器与分支间移动选中；",
      "A：在选中步骤前打开快速插入；",
      "B / Enter：在选中步骤后打开快速插入；",
      "Alt+↑ / Alt+↓：上移 / 下移选中步骤；",
      "F2：展开或折叠循环、判断等分支容器；",
      "Delete / Backspace：删除选中步骤；",
      "Ctrl+A：全选步骤；",
      "Ctrl+C / Ctrl+V：复制 / 粘贴步骤；",
      "Esc：关闭快速插入面板；",
      "选中单步时可固定到聊天（📌）。",
    ],
  },
  {
    title: "步骤弹窗 · 变量 · 运行",
    lines: [
      "步骤编辑弹窗：",
      "Alt+S：应用更改；",
      "Esc：关闭（有未保存修改时会提示）；",
      "部分字段双击标签可创建变量。",
      "",
      "变量侧栏：",
      "Ctrl+A：全选变量行；",
      "Ctrl+C / Ctrl+V：复制 / 粘贴变量行。",
      "",
      "顶部工具栏可运行、调试、在 Quicker 桌面版中打开动作编辑器。",
      "桌面版另有 F5/F6 运行、Ctrl+G 步骤组等快捷键，Web 版逐步对齐。",
    ],
  },
];
