namespace QuickerRpc.Console.Mcp;

/// <summary>Resolves the Quicker authoring workspace root for MCP and CLI.</summary>
internal static class QkrpcMcpWorkspaceResolver
{
    internal const string FollowAgentWorkspaceToken = "${workspaceFolder}";

    internal static string? ResolveFromEnvironment()
    {
        var fromRoot = Environment.GetEnvironmentVariable("QKRPC_WORKSPACE_ROOT")?.Trim();
        if (TryNormalizeRoot(fromRoot, out var normalizedRoot))
        {
            return normalizedRoot;
        }

        if (TryParseWorkspaceFolderPaths(
                Environment.GetEnvironmentVariable("WORKSPACE_FOLDER_PATHS"),
                out var fromHost))
        {
            return fromHost;
        }

        var fromCwd = Environment.GetEnvironmentVariable("QKRPC_CWD")?.Trim();
        if (TryNormalizeRoot(fromCwd, out var normalizedCwd))
        {
            return normalizedCwd;
        }

        return TryNormalizeRoot(Directory.GetCurrentDirectory(), out var processCwd)
            ? processCwd
            : null;
    }

    internal static bool IsWorkspacePlaceholder(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        return value.Contains(FollowAgentWorkspaceToken, StringComparison.Ordinal)
            || value.Contains("$WORKSPACE_FOLDER_PATHS", StringComparison.Ordinal);
    }

    internal static bool ShouldFollowAgentWorkspace(string? configuredWorkspace) =>
        string.IsNullOrWhiteSpace(configuredWorkspace)
        || IsWorkspacePlaceholder(configuredWorkspace);

    internal static string ResolveMcpEnvWorkspace(string? configuredWorkspace)
    {
        if (ShouldFollowAgentWorkspace(configuredWorkspace))
        {
            return FollowAgentWorkspaceToken;
        }

        return Path.GetFullPath(configuredWorkspace!.Trim());
    }

    internal static bool TryParseWorkspaceFolderPaths(string? raw, out string workspaceRoot)
    {
        workspaceRoot = string.Empty;
        if (string.IsNullOrWhiteSpace(raw) || IsWorkspacePlaceholder(raw))
        {
            return false;
        }

        foreach (var segment in SplitWorkspaceFolderPaths(raw))
        {
            if (TryNormalizeRoot(segment, out var normalized))
            {
                workspaceRoot = normalized;
                return true;
            }
        }

        return false;
    }

    internal static bool TryNormalizeRoot(string? value, out string workspaceRoot)
    {
        workspaceRoot = string.Empty;
        if (string.IsNullOrWhiteSpace(value) || IsWorkspacePlaceholder(value))
        {
            return false;
        }

        try
        {
            workspaceRoot = Path.GetFullPath(value.Trim());
            return true;
        }
        catch
        {
            return false;
        }
    }

    internal static bool TryParseFileRootUri(string? uri, out string workspaceRoot)
    {
        workspaceRoot = string.Empty;
        if (string.IsNullOrWhiteSpace(uri))
        {
            return false;
        }

        if (!Uri.TryCreate(uri.Trim(), UriKind.Absolute, out var parsed))
        {
            return TryNormalizeRoot(uri, out workspaceRoot);
        }

        if (!parsed.IsFile)
        {
            return false;
        }

        return TryNormalizeRoot(parsed.LocalPath, out workspaceRoot);
    }

    private static IEnumerable<string> SplitWorkspaceFolderPaths(string raw)
    {
        var separators = OperatingSystem.IsWindows()
            ? new[] { ';', ',' }
            : new[] { ':', ',', ';' };

        foreach (var segment in raw.Split(separators, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (segment.Length == 0)
            {
                continue;
            }

            if (OperatingSystem.IsWindows()
                && segment.Length == 1
                && char.IsLetter(segment[0]))
            {
                continue;
            }

            yield return segment;
        }
    }
}
