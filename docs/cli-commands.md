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
- 动作编写先读 `qkrpc guide get --topic authoring-workflow --json`。
- step 参数固定走 `step-runner search -> step-runner get`，禁止猜键名。

## 命令族

| 命令族 | 用途 |
|---|---|
| `help`、`wait`、`serve` | 自描述、连接等待、HTTP 服务 |
| `agent setup`、`mcp` | Agent 插件/MCP 安装与 stdio server |
| `guide`、`step-runner` | 动作编写指南和步骤 schema |
| `action` | 创建、查询、workspace 同步、运行、调试、分享 |
| `subprogram` | 全局子程序查询、workspace 同步和分享 |
| `profile`、`process` | Quicker 动作页与虚拟场景布局 |
| `settings`、`launcher` | 设置读写、打开设置页、统一意图解析 |
| `trigger` | 事件触发器查询与维护 |
| `chrome` | 通过 Quicker Connector 控制用户浏览器 |

## 本地编写工作流

Coding Agent 优先使用 MCP 的同名能力；CLI 示例用于人工诊断和脚本：

```powershell
qkrpc wait --json
qkrpc guide get --topic authoring-workflow --json

qkrpc action get --id <guid> --return-mode full --json
qkrpc action apply --dir .quicker/actions/<project> --json
qkrpc action run --id <guid> --wait --json

qkrpc subprogram get --id <idOrName> --return-mode full --json
qkrpc subprogram apply --dir .quicker/subprograms/<project> --json
```

磁盘程序体由宿主文件工具修改，再用 `workspace_program patch` 或对应 `apply` 保存；
不要把 inline steps JSON 直接传给工具，也不要在 patch 后再次 full get。

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
