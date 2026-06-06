using System.ComponentModel;
using ModelContextProtocol.Server;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.Console.Mcp;

[McpServerToolType]
public sealed class QkrpcMcpSyncTools
{
    private readonly QkrpcMcpRuntime _runtime;

    public QkrpcMcpSyncTools(QkrpcMcpRuntime runtime) => _runtime = runtime;

    [McpServerTool(Name = "qkrpc_sync")]
    [Description(
        "Sync Quicker programs with on-disk .quicker/ workspace (QKRPC_WORKSPACE_ROOT). "
        + "Edit data.json and files/ with normal file tools — not here. "
        + "Read .quicker/README.md and .quicker/index.json for layout and paths. "
        + "Actions: reindex | pull | push | validate | diagnostics.")]
    public async Task<string> QkrpcSync(
        string action,
        string? target = null,
        string? id = null,
        string? subProgramId = null,
        bool force = false,
        long? editVersion = null,
        int? waitMs = null,
        CancellationToken cancellationToken = default)
    {
        string workspaceRoot;
        try
        {
            workspaceRoot = RequireWorkspaceRoot();
        }
        catch (Exception ex)
        {
            return Error(ex.Message);
        }

        QkrpcMcpWorkspaceIndex.EnsureReadme(workspaceRoot);
        var verb = (action ?? string.Empty).Trim().ToLowerInvariant();

        try
        {
            switch (verb)
            {
                case "reindex":
                    var indexPath = QkrpcMcpWorkspaceIndex.Write(workspaceRoot);
                    return QkrpcMcpJson.FormatObject(new
                    {
                        ok = true,
                        action = "reindex",
                        indexPath,
                        relativePath = QkrpcMcpWorkspaceIndex.RelativePath,
                        readmePath = QkrpcMcpWorkspaceReadme.RelativePath,
                    });
                case "pull":
                    return await PullAsync(workspaceRoot, target, id, cancellationToken)
                        .ConfigureAwait(false);
                case "push":
                    return await PushAsync(workspaceRoot, target, id, subProgramId, force, cancellationToken)
                        .ConfigureAwait(false);
                case "validate":
                    return await ValidateAsync(workspaceRoot, target, id, subProgramId, cancellationToken)
                        .ConfigureAwait(false);
                case "diagnostics":
                    return await DiagnosticsAsync(
                        workspaceRoot,
                        target,
                        id,
                        subProgramId,
                        editVersion,
                        waitMs,
                        cancellationToken).ConfigureAwait(false);
                default:
                    return Error("action must be reindex | pull | push | validate | diagnostics");
            }
        }
        catch (Exception ex)
        {
            return Error(ex.Message);
        }
        finally
        {
            if (verb is "pull" or "push" or "reindex")
            {
                try
                {
                    QkrpcMcpWorkspaceIndex.Write(workspaceRoot);
                }
                catch
                {
                    // non-fatal
                }
            }
        }
    }

    private string RequireWorkspaceRoot()
    {
        var root = _runtime.WorkspaceRoot;
        if (string.IsNullOrWhiteSpace(root))
        {
            throw new InvalidOperationException(
                "QKRPC_WORKSPACE_ROOT is not set. Run: qkrpc mcp install --workspace <path>");
        }

        return Path.GetFullPath(root);
    }

    private async Task<string> PullAsync(
        string workspaceRoot,
        string? target,
        string? id,
        CancellationToken cancellationToken)
    {
        var kind = (target ?? "action").Trim().ToLowerInvariant();
        var primaryId = (id ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(primaryId))
        {
            return Error("id is required for pull");
        }

        if (kind == "action")
        {
            return await _runtime.InvokeOpAsync(
                "action.extract",
                QkrpcMcpJson.ToElement(new { id = primaryId, workspaceRoot }),
                cancellationToken).ConfigureAwait(false);
        }

        if (kind == "global_subprogram")
        {
            var dir = ResolveGlobalSubProgramDir(workspaceRoot, primaryId);
            return await _runtime.InvokeOpAsync(
                "subprogram.export",
                QkrpcMcpJson.ToElement(new { id = primaryId, dir, workspaceRoot }),
                cancellationToken).ConfigureAwait(false);
        }

        return Error("pull target must be action | global_subprogram");
    }

    private async Task<string> PushAsync(
        string workspaceRoot,
        string? target,
        string? id,
        string? subProgramId,
        bool force,
        CancellationToken cancellationToken)
    {
        var kind = (target ?? "action").Trim().ToLowerInvariant();
        var primaryId = (id ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(primaryId))
        {
            return Error("id is required for push");
        }

        string response;
        if (kind == "global_subprogram")
        {
            var dir = ResolveGlobalSubProgramDir(workspaceRoot, primaryId);
            response = await _runtime.InvokeOpAsync(
                "subprogram.import",
                QkrpcMcpJson.ToElement(new { dir, force, workspaceRoot }),
                cancellationToken).ConfigureAwait(false);
        }
        else
        {
            response = await _runtime.InvokeOpAsync(
                "action.apply",
                QkrpcMcpJson.ToElement(new { id = primaryId, force, workspaceRoot }),
                cancellationToken).ConfigureAwait(false);
        }

        var projectDir = ResolveProjectDir(workspaceRoot, kind, primaryId, subProgramId);
        await _runtime.InvokeOpAsync(
            "project.lint.schedule",
            QkrpcMcpJson.ToElement(new
            {
                projectDir,
                workspaceRoot,
                target = kind,
                id = primaryId,
                subProgramId,
            }),
            cancellationToken).ConfigureAwait(false);

        return response;
    }

    private async Task<string> ValidateAsync(
        string workspaceRoot,
        string? target,
        string? id,
        string? subProgramId,
        CancellationToken cancellationToken)
    {
        var kind = (target ?? "action").Trim().ToLowerInvariant();
        var primaryId = (id ?? string.Empty).Trim();

        if (kind == "global_subprogram")
        {
            var dir = ResolveGlobalSubProgramDir(workspaceRoot, primaryId);
            return await _runtime.InvokeOpAsync(
                "subprogram.validate",
                QkrpcMcpJson.ToElement(new { dir, workspaceRoot }),
                cancellationToken).ConfigureAwait(false);
        }

        return await _runtime.InvokeOpAsync(
            "action.validate",
            QkrpcMcpJson.ToElement(new
            {
                id = string.IsNullOrWhiteSpace(primaryId) ? null : primaryId,
                workspaceRoot,
            }),
            cancellationToken).ConfigureAwait(false);
    }

    private Task<string> DiagnosticsAsync(
        string workspaceRoot,
        string? target,
        string? id,
        string? subProgramId,
        long? editVersion,
        int? waitMs,
        CancellationToken cancellationToken)
    {
        var kind = (target ?? "action").Trim().ToLowerInvariant();
        var primaryId = (id ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(primaryId))
        {
            return Task.FromResult(Error("id is required for diagnostics"));
        }

        var projectDir = ResolveProjectDir(workspaceRoot, kind, primaryId, subProgramId);
        return _runtime.InvokeOpAsync(
            "project.diagnostics.get",
            QkrpcMcpJson.ToElement(new
            {
                projectDir,
                workspaceRoot,
                target = kind,
                id = primaryId,
                subProgramId,
                editVersion,
                waitMs = waitMs ?? 0,
            }),
            cancellationToken);
    }

    private static string ResolveProjectDir(
        string workspaceRoot,
        string targetKind,
        string id,
        string? subProgramId)
    {
        if (targetKind == "embedded_subprogram")
        {
            var embeddedId = (subProgramId ?? string.Empty).Trim();
            if (embeddedId.Length == 0)
            {
                throw new InvalidOperationException("subProgramId is required for embedded_subprogram.");
            }

            var actionDir = ActionProjectCatalog.FindActionProjectDirectoryByActionId(id, workspaceRoot)
                ?? throw new InvalidOperationException($"Action project not found: {id}");
            return QuickerProjectLayout.GetActionEmbeddedSubProgramDirectory(actionDir, embeddedId);
        }

        if (targetKind == "global_subprogram")
        {
            return ResolveGlobalSubProgramDir(workspaceRoot, id);
        }

        return ActionProjectCatalog.FindActionProjectDirectoryByActionId(id, workspaceRoot)
            ?? QuickerProjectLayout.GetActionProjectDirectory(
                ActionProjectDirectoryNaming.DirectoryNameFromActionId(id),
                workspaceRoot);
    }

    private static string ResolveGlobalSubProgramDir(string workspaceRoot, string subProgramId)
    {
        var root = QuickerProjectLayout.GetKindRoot(QuickerProjectKind.SubProgram, workspaceRoot);
        if (Directory.Exists(root))
        {
            foreach (var dir in Directory.EnumerateDirectories(root))
            {
                if (string.Equals(Path.GetFileName(dir), subProgramId, StringComparison.OrdinalIgnoreCase))
                {
                    return dir;
                }

                try
                {
                    var info = QuickerProjectFiles.ReadSubProgramInfo(dir);
                    var sid = (info.Id ?? info.Name ?? string.Empty).Trim();
                    if (sid.Length > 0 && string.Equals(sid, subProgramId, StringComparison.OrdinalIgnoreCase))
                    {
                        return dir;
                    }
                }
                catch
                {
                    // skip
                }
            }
        }

        return QuickerProjectLayout.GetSubProgramProjectDirectory(subProgramId, workspaceRoot);
    }

    private static string Error(string message) =>
        QkrpcMcpJson.FormatObject(new { ok = false, errorMessage = message });
}
