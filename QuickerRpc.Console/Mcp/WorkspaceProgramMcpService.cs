namespace QuickerRpc.Console.Mcp;

/// <summary>
/// Workspace sync ops only — disk file edits are done with the host agent's file tools.
/// </summary>
internal sealed class WorkspaceProgramMcpService
{
    private readonly QkrpcMcpRuntime _runtime;

    internal WorkspaceProgramMcpService(QkrpcMcpRuntime runtime) => _runtime = runtime;

    internal async Task<string> ExecuteAsync(
        string action,
        string? target,
        string? id,
        string? subProgramId,
        bool force,
        long? editVersion,
        int? waitMs,
        CancellationToken cancellationToken)
    {
        string workspaceRoot;
        try
        {
            workspaceRoot = QkrpcMcpWorkspaceHelpers.RequireWorkspaceRoot(_runtime);
        }
        catch (Exception ex)
        {
            return QkrpcMcpWorkspaceHelpers.FormatError(ex.Message);
        }

        QkrpcMcpWorkspaceIndex.EnsureReadme(workspaceRoot);
        var verb = (action ?? string.Empty).Trim().ToLowerInvariant();

        try
        {
            var result = verb switch
            {
                "projects_list" => ProjectsList(workspaceRoot, target),
                "reindex" => Reindex(workspaceRoot),
                "patch" => await PatchAsync(workspaceRoot, target, id, subProgramId, force, cancellationToken)
                    .ConfigureAwait(false),
                "validate" => await ValidateAsync(workspaceRoot, target, id, subProgramId, cancellationToken)
                    .ConfigureAwait(false),
                "diagnostics" => await DiagnosticsAsync(
                    workspaceRoot, target, id, subProgramId, editVersion, waitMs, cancellationToken)
                    .ConfigureAwait(false),
                _ => QkrpcMcpWorkspaceHelpers.FormatError(
                    "action must be projects_list | reindex | patch | validate | diagnostics. "
                    + "Edit data.json and files/ with your host file tools; see quicker://workspace/readme "
                    + "or docs get topic=workspace-editing."),
            };

            if (verb is "patch" or "reindex")
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

            return result;
        }
        catch (Exception ex)
        {
            return QkrpcMcpWorkspaceHelpers.FormatError(ex.Message);
        }
    }

    private static string ProjectsList(string workspaceRoot, string? target)
    {
        var kind = (target ?? "all").Trim().ToLowerInvariant();
        var doc = QkrpcMcpWorkspaceIndex.Build(workspaceRoot);
        if (kind == "action")
        {
            doc.Projects = doc.Projects.Where(p => p.Target == "action").ToList();
        }
        else if (kind == "global_subprogram")
        {
            doc.Projects = doc.Projects.Where(p => p.Target == "global_subprogram").ToList();
        }

        return QkrpcMcpJson.FormatObject(new
        {
            ok = true,
            action = "projects_list",
            target = kind,
            projects = doc.Projects,
            workspaceRoot = doc.WorkspaceRoot,
            quickerRoot = doc.QuickerRoot,
            readmeResource = "quicker://workspace/readme",
            indexResource = "quicker://workspace/index",
        });
    }

    private static string Reindex(string workspaceRoot)
    {
        var indexPath = QkrpcMcpWorkspaceIndex.Write(workspaceRoot);
        return QkrpcMcpJson.FormatObject(new
        {
            ok = true,
            action = "reindex",
            indexPath,
            relativePath = QkrpcMcpWorkspaceIndex.RelativePath,
            readmePath = QkrpcMcpWorkspaceReadme.RelativePath,
        });
    }

    private async Task<string> PatchAsync(
        string workspaceRoot,
        string? target,
        string? id,
        string? subProgramId,
        bool force,
        CancellationToken cancellationToken)
    {
        var kind = (target ?? "action").Trim().ToLowerInvariant();
        var primaryId = (id ?? string.Empty).Trim();
        if (primaryId.Length == 0)
        {
            return QkrpcMcpWorkspaceHelpers.FormatError("id is required for patch");
        }

        string response;
        if (kind == "global_subprogram")
        {
            var dir = QkrpcMcpWorkspaceHelpers.ResolveGlobalSubProgramDir(workspaceRoot, primaryId);
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

        var projectDir = QkrpcMcpWorkspaceHelpers.ResolveProjectDir(workspaceRoot, kind, primaryId, subProgramId);
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

    private Task<string> ValidateAsync(
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
            var dir = QkrpcMcpWorkspaceHelpers.ResolveGlobalSubProgramDir(workspaceRoot, primaryId);
            return _runtime.InvokeOpAsync(
                "subprogram.validate",
                QkrpcMcpJson.ToElement(new { dir, workspaceRoot }),
                cancellationToken);
        }

        return _runtime.InvokeOpAsync(
            "action.validate",
            QkrpcMcpJson.ToElement(new
            {
                id = string.IsNullOrWhiteSpace(primaryId) ? null : primaryId,
                workspaceRoot,
            }),
            cancellationToken);
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
        if (primaryId.Length == 0)
        {
            return Task.FromResult(QkrpcMcpWorkspaceHelpers.FormatError("id is required for diagnostics"));
        }

        var projectDir = QkrpcMcpWorkspaceHelpers.ResolveProjectDir(workspaceRoot, kind, primaryId, subProgramId);
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
}
