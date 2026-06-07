import Link from "next/link";
import { CLIPBOARD_HISTORY_DISABLED_MESSAGE } from "@/lib/clipboard-history/clipboard-history-config";

export default function ClipboardPage() {
  return (
    <main className="clipboard-history-page">
      <div className="clipboard-history">
        <header className="clipboard-history__header">
          <div>
            <h1 className="clipboard-history__title">剪贴板历史</h1>
            <p className="clipboard-history__subtitle">{CLIPBOARD_HISTORY_DISABLED_MESSAGE}</p>
          </div>
        </header>
        <p className="clipboard-history__hint">
          <Link href="/">返回主页</Link>
        </p>
      </div>
    </main>
  );
}
