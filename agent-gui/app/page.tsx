import dynamic from "next/dynamic";
import { ChatBootShell } from "@/components/shell/ChatBootShell";

const Chat = dynamic(
  () => import("@/components/chat/Chat").then((mod) => ({ default: mod.Chat })),
  { loading: () => <ChatBootShell /> },
);

export default function Page() {
  return <Chat />;
}
