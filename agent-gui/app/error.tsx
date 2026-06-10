"use client";

import { useEffect } from "react";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("[QuickerAgent] route error", error);
  }, [error]);

  return (
    <main className="qa-error-page">
      <h1>页面遇到问题</h1>
      <p>
        对话数据保存在本机，通常不会因刷新而丢失。可先尝试重新加载；若仍失败，请完全退出
        QuickerAgent 后重新打开。
      </p>
      {error.message ? (
        <pre className="qa-error-page__detail">{error.message}</pre>
      ) : null}
      <div className="qa-error-page__actions">
        <button type="button" onClick={() => reset()}>
          重试
        </button>
        <button
          type="button"
          onClick={() => {
            window.location.reload();
          }}
        >
          刷新页面
        </button>
      </div>
    </main>
  );
}
