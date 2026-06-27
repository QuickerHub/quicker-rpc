using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.Console.Mcp;

internal static class QkrpcMcpWorkspaceHelpers
{
    internal static async Task<string> RequireWorkspaceRootAsync(
        QkrpcMcpRuntime runtime,
        string? overrideRoot,
        CancellationToken cancellationToken)
    {
        if (QkrpcMcpWorkspaceResolver.TryNormalizeRoot(overrideRoot, out var explicitRoot))
        {
            return explicitRoot;
        }

        return await runtime.ResolveWorkspaceRootAsync(cancellationToken).ConfigureAwait(false);
    }

    internal static string ResolveProjectDir(
        string workspaceRoot,
        string targetKind,
        string id,
        string? subProgramId)
    {
        var kind = (targetKind ?? "action").Trim().ToLowerInvariant();
        if (kind == "embedded_subprogram")
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

        if (kind == "global_subprogram")
        {
            return ResolveGlobalSubProgramDir(workspaceRoot, id);
        }

        return ActionProjectCatalog.FindActionProjectDirectoryByActionId(id, workspaceRoot)
            ?? QuickerProjectLayout.GetActionProjectDirectory(
                ActionProjectDirectoryNaming.DirectoryNameFromActionId(id),
                workspaceRoot);
    }

    internal static string ResolveGlobalSubProgramDir(string workspaceRoot, string subProgramId)
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

    internal static string FormatError(string message) =>
        QkrpcMcpJson.FormatObject(new { ok = false, errorMessage = message });
}
