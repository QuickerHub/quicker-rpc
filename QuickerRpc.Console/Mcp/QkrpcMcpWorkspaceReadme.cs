namespace QuickerRpc.Console.Mcp;

/// <summary>Static workspace layout doc written to {workspace}/.quicker/README.md.</summary>
internal static class QkrpcMcpWorkspaceReadme
{
    internal const string RelativePath = ".quicker/README.md";

    internal const string Content = """
        # Quicker 工作区（.quicker）

        本目录是 **Quicker 动作/子程序的本地编辑副本**。用 **Agent 自带的文件读写工具**（Cursor Read/Write/StrReplace 等）改 `data.json` 和 `files/`，改完后用 MCP **`workspace_program` `action=patch`** 保存进 Quicker。

        ## 目录结构

        ```text
        .quicker/
          README.md          ← 本说明
          index.json         ← 项目索引（workspace_program reindex / patch 后更新）
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

        1. **pull** — `qkrpc_action_get` / `qkrpc_subprogram_get`（首次同步到磁盘）
        2. **编辑文件** — 用宿主 Agent 的文件工具改 `data.json` / `files/*`（勿猜 step-runner 键名；先 `docs` topic=step-runner-get）
        3. **patch** — `workspace_program` `action=patch`（编译 file 引用并保存进 Quicker）
        4. **diagnostics** — `workspace_program` `action=diagnostics`（可选，`waitMs` 最多 30000）

        ## data.json 要点

        - 仅含 `steps` + `variables`（无内联 `subPrograms` 数组）
        - 长内容（>4 行）放 `files/`，引用：`"script": { "file": "files/main.cs" }`
        - 插值：`$$` / `$=` 前缀；变量直接绑定用 `varKey`
        - 保存前：`qkrpc_step_runner_get` 查 schema

        ## workspace_program（MCP）

        | action | 说明 |
        |--------|------|
        | `projects_list` | 列出 `.quicker` 项目（可读 `quicker://workspace/index`） |
        | `reindex` | 扫描磁盘，刷新 `index.json` |
        | `patch` | `target=action|global_subprogram|embedded_subprogram`，`id` → 磁盘写入 Quicker |
        | `validate` | 校验 file 引用与 data.json |
        | `diagnostics` | 读 `.qkrpc/diagnostics.json`（patch 后自动 schedule lint） |

        **MCP 不提供文件读写** — 用 Cursor / Claude Code / Codex 自带的文件工具编辑路径。

        ## 更多文档

        - MCP `docs` `action=get` `topic=workspace-editing` 或 `authoring-workflow`
        - MCP 资源：`quicker://workspace/readme`、`quicker://workspace/index`
        - Skill：**quicker-authoring**

        环境变量：默认跟随 MCP 宿主当前工作区（`QKRPC_WORKSPACE_ROOT=${workspaceFolder}` 或 MCP roots）。固定目录：`qkrpc agent setup --workspace <path>`。
        """;
}
