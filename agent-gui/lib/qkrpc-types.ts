export type QkrpcRunResult = {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  parsed: unknown | null;
  truncated: boolean;
};
