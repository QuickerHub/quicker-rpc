namespace QuickerRpc.Console.Mcp;

/// <summary>Static workspace layout doc written to {workspace}/.quicker/README.md.</summary>
internal static class QkrpcMcpWorkspaceReadme
{
    internal const string RelativePath = ".quicker/README.md";

    internal const string Content = """
        # Quicker 工作区（.quicker）

        本目录是 **Quicker 动作/子程序的本地编辑副本**。请用编辑器的**普通文件读写**改 `data.json` 和 `files/`，改完后再 `push` 回 Quicker。

        ## 目录结构

        ```text
        .quicker/
          README.md          ← 本说明
          index.json         ← 项目索引（qkrpc_sync reindex / pull / push 后更新）
          actions/{actionId}/
            info.json        ← 标题、图标、editVersion
            data.json        ← steps[] + variables[]（压缩 XAction）
            files/           ← 长脚本等外置；data.json 里用 { "file": "files/…" }
            subprograms/{subId}/
              info.json
              data.json
              files/
          subprograms/{name}/   ← 全局公共子程序
            info.json
            data.json
            files/
        ```

        ## 推荐流程

        1. **pull** — 从 Quicker 拉到磁盘（`qkrpc_sync pull` 或 MCP 工具）
        2. **直接编辑文件** — 改 `data.json` / `files/*`（用 Cursor 自带读写，勿猜 step-runner 键名；先 `docs_get topic=step-runner-get`）
        3. **push** — 编译 file 引用并保存进 Quicker（`qkrpc_sync push`）
        4. **diagnostics** — 查看语法诊断（可选，`waitMs` 最多 30000）

        ## data.json 要点

        - 仅含 `steps` + `variables`（无内联 `subPrograms` 数组）
        - 长内容（>4 行）放 `files/`，引用：`"script": { "file": "files/main.cs" }`
        - 插值：`$$` / `$=` 前缀；变量直接绑定用 `varKey`
        - 保存前：`qkrpc_step_runner_get` 查 schema

        ## 同步命令（MCP 工具 qkrpc_sync）

        | action | 说明 |
        |--------|------|
        | `reindex` | 扫描磁盘，刷新 `index.json` |
        | `pull` | `target=action`，`id`=动作 GUID → extract 到 `.quicker/actions/` |
        | `push` | `target=action|global_subprogram`，`id` → apply/import |
        | `validate` | 校验 file 引用与 data.json |
        | `diagnostics` | 读 `.qkrpc/diagnostics.json`（push 后自动 schedule lint） |

        ## 更多文档

        MCP 工具 `docs_get`：`authoring-workflow`、`workspace-editing`、`action-data-schema`

        环境变量：`QKRPC_WORKSPACE_ROOT` = 含 `.quicker` 的项目根目录。

        Cursor / VS Code：打开含 `.vscode/settings.json` 的工作区，让集成终端继承 `terminal.integrated.env`（`qkrpc` 在 PATH）；Agent shell 若找不到 CLI，用 MCP 工具或完整路径，勿盲目 install。
        """;
}
