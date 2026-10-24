# qkrpc CLI 导航

命令、参数和示例的运行时事实源是：

```powershell
qkrpc help --json
qkrpc <command> --help
```

本文只保留命令族和安全工作流，不复制完整参数表。

## 约定

- 自动化与 Agent 使用 `--json`；成功退出码为 `0`，失败为 `1`。
- 连接失败使用 `qkrpc wait --json`，不要循环调用 shell probe。
- 大 JSON 使用 `--patch-file`、`--xaction-file` 或磁盘项目，不放在命令行参数中。
- 现有 V1 动作默认先读 `qkrpc guide get --topic program-source --json`；创建与旧 JSON 流程读 `authoring-workflow`。V2 用原生 MCP。
- step 参数固定走 `step-runner search -> step-runner get`，禁止猜键名。

## 命令族

| 命令族 | 用途 |
|---|---|
| `host list` | 只读发现当前用户的 V1/V2 session 与完整绑定 |
| `help`、`wait`、`serve` | 自描述、连接等待、HTTP 服务 |
| `agent setup`、`mcp` | Agent 插件/MCP 安装与 stdio server |
| `guide`、`step-runner` | 动作编写指南和步骤 schema |
| `action` | 查询、V1 YAML 源 open/save、创建、旧 workspace 同步、运行、调试、分享 |
| `subprogram` | 全局子程序查询、workspace 同步和分享 |
| `profile`、`process` | Quicker 动作页与虚拟场景布局 |
| `settings`、`launcher` | 设置读写、打开设置页、统一意图解析 |
| `trigger` | 事件触发器查询与维护 |
| `chrome` | 通过 Quicker Connector 控制用户浏览器 |

## 选择宿主

`qkrpc host list --json` 不拉起插件。一个兼容实例自动选择；多个实例使用
`--host-session <session>`（或 `QKRPC_HOST_SESSION`）。CLI/MCP/serve 均支持该全局选项。
需要固定完整目标时传 `--host-binding <host list 中的 JSON>`，或 `QKRPC_HOST_BINDING`。
MCP `qkrpc_host_list` 返回同一候选集，source open 也接受 `hostSessionId`；HTTP 使用
`host.list`，随后在请求中携带完整 `hostBinding`。

保存绑定 bundle 原宿主；断连、重启或 session 不符不会改写另一个实例。
`WRITE_RESULT_UNKNOWN` 表示发送后无法确认结果，必须核对原宿主，不能自动重发。
旧 bundle 缺少绑定时仍可离线 dry-run，但实际保存必须重新 open。

HTTP `timeoutSeconds` 是单次 invoke 的共同处理预算，包含宿主发现、绑定预检、连接排队、
管道握手与 RPC，连接完成后不会重新计时。预算到期返回 `RPC_TIMEOUT`；调用方取消保留
原取消信号。已开始写入的明确收据或 `WRITE_RESULT_UNKNOWN` 继续保留，超时不证明没有
写入，也不撤销原生副作用。错误清理不等待另一个请求正在建立的连接。

## 本地编写工作流

Coding Agent 优先使用 MCP 的同名能力；CLI 示例用于人工诊断和脚本：

```powershell
qkrpc wait --json
qkrpc guide get --topic program-source --json

qkrpc action open --id <guid> --dir .tmp/quicker/edit-action --json
# 编辑 program.source.yaml 与 files/ 后：
qkrpc action save --dir .tmp/quicker/edit-action --dry-run --json
qkrpc action save --dir .tmp/quicker/edit-action --json
qkrpc action run --id <guid> --wait --json

qkrpc subprogram get --id <idOrName> --return-mode full --json
qkrpc subprogram apply --dir .quicker/subprograms/<project> --json
```

独立 MCP 对应 `qkrpc_action_open(id, dir, minLines?, noAutoFiles?)` 和
`qkrpc_action_save(dir, dryRun?)`；HTTP 方法为 `action.open` / `action.save`。
`open` 必须指定新建或空目录，可用 `--min-lines 4` / `--no-auto-files` 控制长参数外置。
只编辑 `program.source.yaml` 与 `files/`，保留 `quicker.source.json` 与内部原生基线
`.qkrpc/baseline.json`。dry-run 完全离线校验；实际 save 检查原动作的 `editVersion`
与 Designer 状态。成功后可继续编辑同一目录，工具更新基线且不重写用户源文件。

YAML 入口覆盖现有 V1 动作程序体；创建、元数据和全局子程序使用原命令。
旧 `get` / `patch` / `apply` 接口保持兼容。QuickerAgent 内置编辑仍走
`workspace_program` 的 `data.json` / `files/` → patch；不要混用两种目录格式。

## 分享与危险操作

- 只有用户明确要求发布时才执行 `action publish` 或 `subprogram publish`。
- 更新已分享内容必须提供 changelog；子程序不能用 `action update` 更新。
- 删除、覆盖、强制写入前先核对准确 id、目标和 `editVersion`。
- 公开动作库搜索与 shared get 是只读发现，不等于本地安装或修改权限。

```powershell
qkrpc action publish --id <guid> --preflight --json
qkrpc action publish --id <guid> --changelog "..." --json

qkrpc subprogram publish --id <idOrName> --preflight --json
qkrpc subprogram publish --id <idOrName> --changelog "..." --json
```

动作编写的程序结构、表达式与文件引用以生成指南为准：
[`action-authoring/README.md`](action-authoring/README.md)。外部 Agent 接入见
[`agent-mcp-integration.md`](agent-mcp-integration.md)。
