"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export type ToolTestSidebarTab =
  | "tools"
  | "prompt"
  | "prompt-chat"
  | "quickerbench"
  | "auto-fix"
  | "launcher"
  | "action-trace"
  | "action-runtime"
  | "context-compression"
  | "voice-input"
  | "ask-question"
  | "llm-probe";

type TabDef = {
  id: ToolTestSidebarTab;
  label: string;
  title: string;
};

const TABS: TabDef[] = [
  { id: "prompt-chat", label: "对话", title: "Prompt 与多轮对话" },
  { id: "quickerbench", label: "Bench", title: "QuickerBench 隔离任务评测" },
  { id: "tools", label: "工具", title: "工具调用套件" },
  { id: "prompt", label: "标题", title: "set_thread_title 标题测试" },
  { id: "launcher", label: "启动器", title: "启动器：Agent / Resolve / Intent" },
  { id: "action-trace", label: "Trace", title: "Action trace 流式调试" },
  { id: "action-runtime", label: "Runtime", title: "ActionRuntime 独立运行/编译测试" },
  { id: "auto-fix", label: "修复", title: "造错→修复场景" },
  { id: "voice-input", label: "语音", title: "语音输入启动延迟" },
  { id: "ask-question", label: "选择", title: "ask_question 用户选择 Dock UI" },
  {
    id: "context-compression",
    label: "压缩",
    title: "上下文压缩 dry-run / Chat",
  },
  {
    id: "llm-probe",
    label: "LLM",
    title: "批量探测 LLM publish/dev/llm-config endpoint",
  },
];

type ToolTestSidebarTabsProps = {
  activeTab: ToolTestSidebarTab;
  onTabChange: (tab: ToolTestSidebarTab) => void;
};

export function ToolTestSidebarTabs({
  activeTab,
  onTabChange,
}: ToolTestSidebarTabsProps) {
  const tabsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = tabsRef.current;
    if (!root) return;

    const onWheel = (e: WheelEvent) => {
      if (root.scrollHeight <= root.clientHeight) return;
      const delta =
        Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (delta === 0) return;
      e.preventDefault();
      root.scrollTop += delta;
    };

    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const root = tabsRef.current;
    if (!root) return;
    const active = root.querySelector<HTMLElement>(
      '.tool-test-sidebar-tabs__btn[aria-selected="true"]',
    );
    if (!active) return;
    active.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTab]);

  return (
    <div
      ref={tabsRef}
      className="tool-test-sidebar-tabs"
      role="tablist"
      aria-label="测试类型"
    >
      {TABS.map((tab) => {
        const selected = activeTab === tab.id;
        if (tab.id === "quickerbench") {
          return (
            <Link
              key={tab.id}
              href="/bench"
              role="tab"
              aria-selected={false}
              className="tool-test-sidebar-tabs__btn"
              title={tab.title}
            >
              {tab.label}
            </Link>
          );
        }
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            className={`tool-test-sidebar-tabs__btn${selected ? " tool-test-sidebar-tabs__btn--active" : ""}`}
            title={tab.title}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
