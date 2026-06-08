import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  buildQkrpcPingDiagnostics,
  buildQkrpcPingUserSummary,
  classifyQkrpcConnectivityIssue,
} from "@/lib/qkrpc-ping-diagnostics";
import type { PingState } from "@/lib/use-qkrpc-ping";

describe("qkrpc-ping-diagnostics", () => {
  test("classify serve down", () => {
    assert.equal(
      classifyQkrpcConnectivityIssue("无法连接 qkrpc serve（http://127.0.0.1:9477）"),
      "serve_down",
    );
  });

  test("classify plugin missing", () => {
    assert.equal(
      classifyQkrpcConnectivityIssue("QuickerRpc 插件未运行（命名管道不可用）"),
      "plugin_missing",
    );
  });

  test("build diagnostics for ok ping", () => {
    const ping: PingState = {
      status: "ok",
      data: {
        ok: true,
        data: { pong: "QuickerRpc", protocolVersion: 3, pipe: "QuickerRpc_Server_QRPC2026" },
      },
    };
    const diag = buildQkrpcPingDiagnostics(ping);
    assert.equal(diag.title, "已连接");
    assert.equal(diag.layers.every((item) => item.status === "ok"), true);
  });

  test("user summary stays plain when connected", () => {
    const ping: PingState = {
      status: "ok",
      data: { ok: true, data: { pong: "pong", protocolVersion: 1 } },
    };
    const summary = buildQkrpcPingUserSummary(ping);
    assert.equal(summary.statusLabel, "Quicker 已连接");
    assert.equal(summary.detail, undefined);
    assert.equal(summary.fixes, undefined);
  });

  test("user summary gives short fixes when serve is down", () => {
    const ping: PingState = {
      status: "error",
      message: "无法连接 qkrpc serve",
      data: { ok: false, stderr: "无法连接 qkrpc serve（http://127.0.0.1:9477）" },
    };
    const summary = buildQkrpcPingUserSummary(ping, "dev");
    assert.equal(summary.statusLabel, "未连接");
    assert.ok(summary.detail);
    assert.ok(summary.fixes && summary.fixes.length <= 2);
    assert.ok(summary.fixes?.some((line) => line.includes("build.ps1 -t")));
  });

  test("build diagnostics for serve down", () => {
    const ping: PingState = {
      status: "error",
      message: "无法连接 qkrpc serve",
      data: { ok: false, stderr: "无法连接 qkrpc serve（http://127.0.0.1:9477）" },
    };
    const diag = buildQkrpcPingDiagnostics(ping, "dev");
    assert.equal(diag.title, "serve 未就绪");
    assert.equal(diag.layers[0]?.status, "fail");
    assert.ok(diag.hints.some((hint) => hint.includes("build.ps1 -t")));
  });
});
