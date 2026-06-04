export type FrontendIssueKind =
  | "http"
  | "compile"
  | "runtime"
  | "console"
  | "hydration";

export type FrontendIssue = {
  kind: FrontendIssueKind;
  message: string;
  source?: string;
  stack?: string;
  url?: string;
  at?: string;
};

export type FrontendSmokeResult = {
  ok: boolean;
  url: string;
  statusCode?: number;
  issues: FrontendIssue[];
  checkedAt: string;
};

export type ClientFrontendErrorReport = {
  kind: "error" | "unhandledrejection" | "console";
  message: string;
  stack?: string;
  source?: string;
  line?: number;
  col?: number;
  url: string;
  at: string;
};

export type DevServerInfo = {
  url: string;
  port: number;
  host: string;
  startedAt: string;
};

export type FrontendBuildErrorSnapshot = {
  capturedAt: string;
  excerpt: string;
  issues: FrontendIssue[];
};
