import type { PingState } from "@/lib/use-qkrpc-ping";

export const QKRPC_SERVE_HEALTH_URL = "http://127.0.0.1:9477/health";
export const QKRPC_PIPE_NAME = "QuickerRpc_Server_QRPC2026";

export type QkrpcDiagnosticLayerId = "serve" | "plugin" | "quicker";

export type QkrpcDiagnosticLayerStatus = "ok" | "fail" | "unknown" | "checking";

export type QkrpcDiagnosticLayer = {
  id: QkrpcDiagnosticLayerId;
  label: string;
  status: QkrpcDiagnosticLayerStatus;
  detail: string;
};

export type QkrpcPingDiagnostics = {
  title: string;
  message: string;
  layers: QkrpcDiagnosticLayer[];
  hints: string[];
};

type PingEnvelope = {
  ok?: boolean;
  stderr?: string;
  data?: unknown;
};

type HealthBody = {
  ok?: boolean;
  pong?: string;
  protocolVersion?: number;
  pipe?: string;
};

function layer(
  id: QkrpcDiagnosticLayerId,
  label: string,
  status: QkrpcDiagnosticLayerStatus,
  detail: string,
): QkrpcDiagnosticLayer {
  return { id, label, status, detail };
}

function normalizeMessage(raw: string): string {
  return raw.trim().toLowerCase();
}

function readEnvelope(ping: PingState): PingEnvelope | null {
  if (ping.status === "ok") {
    return ping.data as PingEnvelope;
  }
  if (ping.status === "error" && ping.data && typeof ping.data === "object") {
    return ping.data as PingEnvelope;
  }
  return null;
}

function readHealthBody(envelope: PingEnvelope | null): HealthBody | null {
  if (!envelope || typeof envelope.data !== "object" || envelope.data === null) {
    return null;
  }
  return envelope.data as HealthBody;
}

function readErrorText(ping: PingState, envelope: PingEnvelope | null): string {
  if (ping.status === "error") {
    const stderr =
      typeof envelope?.stderr === "string" ? envelope.stderr.trim() : "";
    return stderr || ping.message;
  }
  return typeof envelope?.stderr === "string" ? envelope.stderr.trim() : "";
}

export type QkrpcConnectivityIssue =
  | "serve_down"
  | "plugin_missing"
  | "quicker_down"
  | "bootstrap_failed"
  | "pipe_timeout"
  | "cli_missing"
  | "timeout"
  | "unknown";

export function classifyQkrpcConnectivityIssue(text: string): QkrpcConnectivityIssue {
  const msg = normalizeMessage(text);
  if (!msg) return "unknown";

  if (msg.includes("找不到 qkrpc") || msg.includes("qkrpc executable")) {
    return "cli_missing";
  }
  if (
    msg.includes("无法连接 qkrpc serve")
    || msg.includes("econnrefused")
    || msg.includes("fetch failed")
    || msg.includes("检测超时")
  ) {
    return "serve_down";
  }
  if (
    msg.includes("quicker 进程未运行")
    || msg.includes("quicker not running")
    || msg.includes("已跳过 quicker:runaction")
  ) {
    return "quicker_down";
  }
  if (
    msg.includes("已尝试通过 quicker:runaction")
    || msg.includes("wait_timeout")
    || msg.includes("未就绪")
  ) {
    return "bootstrap_failed";
  }
  if (msg.includes("连接 quicker") && msg.includes("超时")) {
    return "pipe_timeout";
  }
  if (
    msg.includes("插件未运行")
    || msg.includes("命名管道不可用")
    || msg.includes("plugin_not_running")
    || msg.includes("health check failed")
  ) {
    return "plugin_missing";
  }
  if (msg.includes("timeout") || msg.includes("timed out") || msg.includes("超时")) {
    return "timeout";
  }
  return "unknown";
}

function hintsForIssue(issue: QkrpcConnectivityIssue, runtime: "dev" | "bundled" | "unknown"): string[] {
  const devServeHint =
    runtime === "dev"
      ? "开发环境：在 quicker-rpc 仓库根目录执行 pwsh ./build.ps1 -t（编译、重载插件并启动 qkrpc serve）。"
      : "安装版通常会自动拉起 serve；若仍失败，可重启 QuickerAgent 或重新安装 qkrpc CLI。";

  switch (issue) {
    case "serve_down":
      return [
        "设置页点「快速检测」或「完整检测」时，Agent 会自动尝试拉起 qkrpc serve。",
        `也可手动确认：浏览器访问 ${QKRPC_SERVE_HEALTH_URL} 应返回 JSON。`,
        devServeHint,
        "若刚改过 Plugin/CLI 代码，需热更新后才会生效。",
      ];
    case "quicker_down":
      return [
        "启动 Quicker（任务栏/托盘应能看到 Quicker 图标）。",
        "启动后点击「重新检测」；Agent 会通过 quicker:runaction 尝试加载 QuickerRpc 插件。",
      ];
    case "plugin_missing":
      return [
        "在 Quicker 中运行一次 QuickerAgent 动作（或 QuickerRpc 监控动作），确保 QuickerRpc 插件已加载。",
        "确认已安装/订阅 QuickerRpc 插件；开发版需先执行 pwsh ./build.ps1 -t 重载 DLL。",
        `插件就绪后命名管道 ${QKRPC_PIPE_NAME} 应可用，再点「重新检测」。`,
      ];
    case "bootstrap_failed":
      return [
        "自动启动插件未成功：请在 Quicker 面板手动点击 QuickerAgent 动作一次。",
        "检查 Quicker 是否弹出错误（插件 DLL 版本不匹配、动作未安装等）。",
        "完成后等待数秒，再点「重新检测」。",
      ];
    case "pipe_timeout":
      return [
        "Quicker 可能繁忙或刚启动：等待 5–10 秒后点「重新检测」。",
        "若持续超时，重启 Quicker 并重新加载 QuickerRpc 插件。",
      ];
    case "cli_missing":
      return [
        "未找到 qkrpc.exe：安装 GitHub Releases 的 qkrpc-win-x64-setup.exe，",
        "或在 quicker-rpc 仓库根目录执行 pwsh ./build.ps1 -t。",
      ];
    case "timeout":
      return [
        "检测超时：确认 Quicker 与 qkrpc serve 均已启动。",
        devServeHint,
        "再次点击「重新检测」进行完整检测（约 3–6 秒）。",
      ];
    default:
      return [
        "按顺序检查：① Quicker 已运行 → ② QuickerRpc 插件已加载 → ③ qkrpc serve 正常。",
        devServeHint,
        "仍失败时，在终端执行 qkrpc ping --json 或 qkrpc wait --json 查看详细错误。",
      ];
  }
}

export function buildQkrpcPingDiagnostics(
  ping: PingState,
  runtime: "dev" | "bundled" | "unknown" = "unknown",
): QkrpcPingDiagnostics {
  if (ping.status === "loading") {
    return {
      title: "正在检测",
      message: "依次检查 qkrpc serve、QuickerRpc 插件与 Quicker 进程…",
      layers: [
        layer("serve", "qkrpc serve", "checking", QKRPC_SERVE_HEALTH_URL),
        layer("plugin", "QuickerRpc 插件", "checking", `管道 ${QKRPC_PIPE_NAME}`),
        layer("quicker", "Quicker 进程", "checking", "由 serve / ping 间接探测"),
      ],
      hints: [],
    };
  }

  const envelope = readEnvelope(ping);
  const health = readHealthBody(envelope);
  const errorText = readErrorText(ping, envelope);
  const issue = classifyQkrpcConnectivityIssue(errorText);

  if (ping.status === "ok" && envelope?.ok !== false) {
    const pipe = health?.pipe?.trim() || QKRPC_PIPE_NAME;
    const protocol =
      health?.protocolVersion !== undefined
        ? `协议 v${health.protocolVersion}`
        : "协议版本未知";
    const pong = health?.pong?.trim() || "pong";
    return {
      title: "已连接",
      message: `${pong} · ${protocol}`,
      layers: [
        layer("serve", "qkrpc serve", "ok", QKRPC_SERVE_HEALTH_URL),
        layer("plugin", "QuickerRpc 插件", "ok", `管道 ${pipe}`),
        layer("quicker", "Quicker 进程", "ok", "RPC 管道 Ping 成功"),
      ],
      hints: [
        "连接正常；若工具仍失败，可尝试切换对话或稍候后重试。",
        "开发者在修改 Plugin/CLI 后需 pwsh ./build.ps1 -t 热更新。",
      ],
    };
  }

  const serveReachable =
    issue !== "serve_down"
    && issue !== "cli_missing"
    && (health !== null || envelope?.ok === false);

  let serveStatus: QkrpcDiagnosticLayerStatus = serveReachable ? "ok" : "fail";
  let pluginStatus: QkrpcDiagnosticLayerStatus = "unknown";
  let quickerStatus: QkrpcDiagnosticLayerStatus = "unknown";

  if (issue === "quicker_down") {
    quickerStatus = "fail";
    if (serveReachable) pluginStatus = "fail";
  } else if (
    issue === "plugin_missing"
    || issue === "pipe_timeout"
    || issue === "bootstrap_failed"
  ) {
    pluginStatus = "fail";
    quickerStatus = issue === "bootstrap_failed" ? "unknown" : "ok";
  } else if (issue === "serve_down" || issue === "cli_missing") {
    serveStatus = "fail";
  } else if (serveReachable) {
    pluginStatus = "fail";
    quickerStatus = "unknown";
  }

  const title =
    issue === "serve_down"
      ? "serve 未就绪"
      : issue === "quicker_down"
        ? "Quicker 未运行"
        : issue === "plugin_missing"
          ? "插件未加载"
          : issue === "bootstrap_failed"
            ? "自动加载失败"
            : issue === "cli_missing"
              ? "qkrpc 未安装"
              : issue === "pipe_timeout"
                ? "管道连接超时"
                : issue === "timeout"
                  ? "检测超时"
                  : "未连接";

  const message =
    errorText
    || (ping.status === "error" ? ping.message : "Quicker RPC 不可用");

  const serveDetail =
    serveStatus === "ok"
      ? "HTTP 可达"
      : issue === "cli_missing"
        ? "qkrpc CLI 缺失，无法启动检测"
        : `无法访问 ${QKRPC_SERVE_HEALTH_URL}`;

  const pluginDetail =
    pluginStatus === "fail"
      ? `命名管道 ${QKRPC_PIPE_NAME} 不可用或未响应`
      : serveStatus === "fail"
        ? "需先启动 serve"
        : "等待检测";

  const quickerDetail =
    quickerStatus === "fail"
      ? "未检测到 Quicker 进程"
      : quickerStatus === "ok"
        ? "进程应在运行"
        : "需 Quicker 运行并加载插件";

  return {
    title,
    message,
    layers: [
      layer("serve", "qkrpc serve", serveStatus, serveDetail),
      layer("plugin", "QuickerRpc 插件", pluginStatus, pluginDetail),
      layer("quicker", "Quicker 进程", quickerStatus, quickerDetail),
    ],
    hints: hintsForIssue(issue, runtime),
  };
}

export type QkrpcPingUserSummary = {
  statusLabel: string;
  /** One-line explanation when disconnected. */
  detail?: string;
  /** Short actionable fixes (shown only on error). */
  fixes?: string[];
};

function userDetailForIssue(issue: QkrpcConnectivityIssue): string {
  switch (issue) {
    case "serve_down":
      return "本机通信服务未就绪，点「重新检测」会自动尝试修复。";
    case "quicker_down":
      return "请先启动 Quicker。";
    case "plugin_missing":
      return "Quicker 已运行，但 QuickerRpc 插件尚未加载。";
    case "bootstrap_failed":
      return "自动加载插件失败，需在 Quicker 中手动运行一次 QuickerAgent 动作。";
    case "pipe_timeout":
      return "连接 Quicker 超时，可稍等几秒后重试。";
    case "cli_missing":
      return "本机未安装 qkrpc 命令行工具。";
    case "timeout":
      return "检测超时，请确认 Quicker 已启动后重试。";
    default:
      return "暂时无法连接 Quicker。";
  }
}

function userFixesForIssue(
  issue: QkrpcConnectivityIssue,
  runtime: "dev" | "bundled" | "unknown",
): string[] {
  switch (issue) {
    case "serve_down":
      return runtime === "dev"
        ? [
            "确认 Quicker 已启动。",
            "开发环境在仓库根目录执行：pwsh ./build.ps1 -t",
          ]
        : ["确认 Quicker 已启动，然后点「重新检测」。", "仍失败可重启 QuickerAgent。"];
    case "quicker_down":
      return ["启动 Quicker 后点「重新检测」。"];
    case "plugin_missing":
      return runtime === "dev"
        ? [
            "在 Quicker 中运行一次 QuickerAgent 动作。",
            "或执行 pwsh ./build.ps1 -t 重载插件。",
          ]
        : ["在 Quicker 中运行一次 QuickerAgent 动作，再点「重新检测」。"];
    case "bootstrap_failed":
    case "pipe_timeout":
      return ["在 Quicker 中手动运行 QuickerAgent 动作，等待数秒后重试。"];
    case "cli_missing":
      return runtime === "dev"
        ? ["在仓库根目录执行：pwsh ./build.ps1 -t"]
        : ["安装 qkrpc-win-x64-setup.exe 后重试。"];
    default:
      return runtime === "dev"
        ? ["确认 Quicker 已启动，必要时执行 pwsh ./build.ps1 -t。"]
        : ["确认 Quicker 已启动，并在 Quicker 中运行 QuickerAgent 动作。"];
  }
}

/** Plain-language copy for the settings panel (no layered technical diagnostics). */
export function buildQkrpcPingUserSummary(
  ping: PingState,
  runtime: "dev" | "bundled" | "unknown" = "unknown",
): QkrpcPingUserSummary {
  if (ping.status === "loading") {
    return { statusLabel: "检测中…" };
  }
  if (ping.status === "ok") {
    return { statusLabel: "Quicker 已连接" };
  }

  const envelope = readEnvelope(ping);
  const errorText = readErrorText(ping, envelope);
  const issue = classifyQkrpcConnectivityIssue(errorText);

  return {
    statusLabel: "未连接",
    detail: userDetailForIssue(issue),
    fixes: userFixesForIssue(issue, runtime),
  };
}
