# RPC 业务超时 — 2026-06-13

## 现象

| 命令 | 结果 |
|------|------|
| `qkrpc ping` / `qkrpc wait` | ✅ 正常 |
| `action create/list` | ❌ RPC_TIMEOUT 15–60s |
| `subprogram get/patch/list` | ❌ 同上 |
| `step-runner get` | ❌ 同上 |
| `http://127.0.0.1:9477/health` | ❌ serve 未运行 |

## 已尝试

- `build.ps1 -t -SkipQkrpcServe`（插件 0.14.4.61+ 重载）
- `qkrpc wait` 后重试

## 影响

- B04 子程序仅 create，未 patch/trace
- B05 未开始实跑
- 学习 Agent 应 **`qkrpc_wait`** 后单次重试，勿连环探活

## 用户检查清单

1. Quicker 主窗口是否被对话框阻塞
2. 插件 DLL 是否已加载（`QuickerRpc_Run` / 监控动作）
3. 必要时重启 Quicker 后再 `qkrpc action list --limit 1 --json`
