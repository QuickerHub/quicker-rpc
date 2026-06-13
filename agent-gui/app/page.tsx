import dynamic from "next/dynamic";
import { Suspense } from "react";
import { ChatBootShell } from "@/components/shell/ChatBootShell";
import {
  parseActionDesignerEmbedFromSearchParams,
  type ActionDesignerEmbedParams,
} from "@/lib/action-designer-embed";
import { DesignerEmbedProvider } from "@/lib/designer-embed-context";

const Chat = dynamic(
  () => import("@/components/chat/Chat").then((mod) => ({ default: mod.Chat })),
  { loading: () => <ChatBootShell /> },
);

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readSearchParam(
  raw: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const value = raw[key];
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return value?.trim() ?? "";
}

function designerEmbedFromSearchParams(
  raw: Record<string, string | string[] | undefined>,
): ActionDesignerEmbedParams {
  return parseActionDesignerEmbedFromSearchParams({
    get(name: string) {
      const value = readSearchParam(raw, name);
      return value || null;
    },
  });
}

export default async function Page({ searchParams }: PageProps) {
  const embed = designerEmbedFromSearchParams(await searchParams);

  return (
    <DesignerEmbedProvider value={embed}>
      <Suspense fallback={<ChatBootShell />}>
        <Chat />
      </Suspense>
    </DesignerEmbedProvider>
  );
}
