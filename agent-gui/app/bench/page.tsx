import dynamic from "next/dynamic";
import { Suspense } from "react";
import { ChatBootShell } from "@/components/shell/ChatBootShell";

const BenchChatPage = dynamic(
  () =>
    import("@/components/bench/BenchChatPage").then((mod) => ({
      default: mod.BenchChatPage,
    })),
  { loading: () => <ChatBootShell /> },
);

export default function Page() {
  return (
    <Suspense fallback={<ChatBootShell />}>
      <BenchChatPage />
    </Suspense>
  );
}
