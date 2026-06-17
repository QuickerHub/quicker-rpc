"use client";

import { useEffect } from "react";

type GlobalErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/** Root error boundary — must define its own html/body (replaces root layout). */
export default function GlobalErrorPage({
  error,
  reset,
}: GlobalErrorPageProps) {
  useEffect(() => {
    console.error("[QuickerAgent] global error", error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body>
        <main className="qa-error-page">
          <div className="qa-error-page__card">
            <div className="qa-error-page__icon" aria-hidden="true">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h1>应用遇到问题</h1>
            <p>
              可先尝试重新加载。开发模式下若反复出现，请停止 dev server、删除
              {" "}
              <code>agent-gui/.next</code>
              {" "}
              后重新运行
              {" "}
              <code>pnpm dev</code>
              。
            </p>
            {error.message ? (
              <pre className="qa-error-page__detail">{error.message}</pre>
            ) : null}
            <div className="qa-error-page__actions">
              <button
                type="button"
                className="qa-error-page__btn qa-error-page__btn--primary"
                onClick={() => reset()}
              >
                重试
              </button>
              <button
                type="button"
                className="qa-error-page__btn"
                onClick={() => {
                  window.location.reload();
                }}
              >
                刷新页面
              </button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
