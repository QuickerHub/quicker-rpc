import type {
  LlmUsageIdentityKind,
  LlmUsageSource,
  QuickerAccountSnapshot,
} from "@/lib/llm-usage-types";

const USAGE_SOURCE_LABELS: Record<LlmUsageSource, string> = {
  chat: "对话",
  title: "标题生成",
  compression: "上下文压缩",
};

export function formatUsageSource(source: LlmUsageSource): string {
  return USAGE_SOURCE_LABELS[source] ?? source;
}

export function formatIdentityKindLabel(kind: LlmUsageIdentityKind): string {
  return kind === "quicker" ? "Quicker 账号" : "本机设备";
}

export function maskIdentityId(id: string, kind: LlmUsageIdentityKind): string {
  const trimmed = id.trim();
  if (!trimmed) return "—";
  if (kind === "device") {
    if (trimmed.length <= 10) return trimmed;
    return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
  }
  if (trimmed.length <= 14) return trimmed;
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

const QUICKER_ACCOUNT_STATUS_LABELS: Record<string, string> = {
  "UserInfo unavailable.": "无法读取 Quicker 账号，请确认 Quicker 已启动并已登录",
  "RuntimeDataStore unavailable.": "无法访问 Quicker 运行时数据",
  "Quicker account is not logged in.": "未登录 Quicker 账号",
  "Not running inside Quicker.": "未在 Quicker 进程内运行",
  "Quicker RPC unavailable.": "Quicker RPC 未连接",
  "Quicker account lookup failed.": "Quicker 账号查询失败",
};

export function formatQuickerAccountStatus(account: QuickerAccountSnapshot | undefined): string {
  if (!account) return "加载中…";
  if (account.loggedIn) return "已登录";
  const message = account.message?.trim();
  if (!message) return "未登录";
  return QUICKER_ACCOUNT_STATUS_LABELS[message] ?? message;
}

export function formatQuickerAccountDisplayName(
  account: QuickerAccountSnapshot | undefined,
): string | undefined {
  if (!account?.loggedIn) return undefined;
  return account.nickName?.trim() || account.userName?.trim() || undefined;
}

export function formatUsageUpdatedAt(iso: string | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
