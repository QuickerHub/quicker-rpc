namespace QuickerRpc.Console.Mcp;

internal static class QkrpcAgentSetupGuidance
{
    private const string ClaudeSnippetFileName = "claude-qkrpc.md";
    private const string MarkerBegin = "<!-- qkrpc-agent-setup:begin -->";
    private const string MarkerEnd = "<!-- qkrpc-agent-setup:end -->";

    internal static IEnumerable<string> InstallClaudeCodeGuidance(QkrpcAgentSetupOptions options, string workspace)
    {
        var snippet = ResolveClaudeSnippet();
        if (snippet is null)
        {
            yield return "Claude Code: skipped (claude-qkrpc.md source not found)";
            yield break;
        }

        var userClaudeDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
            ".claude");
        Directory.CreateDirectory(userClaudeDir);
        var userDest = Path.Combine(userClaudeDir, "CLAUDE.md");
        MergeGuidanceFile(userDest, snippet);
        yield return $"Claude Code (user): {userDest}";

        if (options.Project)
        {
            var projectDest = Path.Combine(workspace, "CLAUDE.md");
            MergeGuidanceFile(projectDest, snippet);
            yield return $"Claude Code (project): {projectDest}";
        }
    }

    private static string? ResolveClaudeSnippet()
    {
        var cwd = Directory.GetCurrentDirectory();
        for (var dir = cwd; !string.IsNullOrEmpty(dir); dir = Path.GetDirectoryName(dir)!)
        {
            var candidate = Path.Combine(dir, "docs", "agent-rules", ClaudeSnippetFileName);
            if (File.Exists(candidate))
            {
                return File.ReadAllText(candidate, System.Text.Encoding.UTF8).Trim();
            }
        }

        var exeDir = Path.GetDirectoryName(Environment.ProcessPath ?? string.Empty);
        if (!string.IsNullOrWhiteSpace(exeDir))
        {
            var bundled = Path.Combine(exeDir, "agent-rules", ClaudeSnippetFileName);
            if (File.Exists(bundled))
            {
                return File.ReadAllText(bundled, System.Text.Encoding.UTF8).Trim();
            }
        }

        return null;
    }

    private static void MergeGuidanceFile(string destPath, string snippet)
    {
        var directory = Path.GetDirectoryName(destPath);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        if (!File.Exists(destPath))
        {
            File.WriteAllText(destPath, snippet + Environment.NewLine, System.Text.Encoding.UTF8);
            return;
        }

        var existing = File.ReadAllText(destPath, System.Text.Encoding.UTF8);
        var beginIndex = existing.IndexOf(MarkerBegin, StringComparison.Ordinal);
        var endIndex = existing.IndexOf(MarkerEnd, StringComparison.Ordinal);

        string merged;
        if (beginIndex >= 0 && endIndex > beginIndex)
        {
            var endInclusive = endIndex + MarkerEnd.Length;
            merged = existing[..beginIndex].TrimEnd()
                + Environment.NewLine + Environment.NewLine
                + snippet
                + existing[endInclusive..].TrimStart();
        }
        else if (!existing.Contains("qkrpc agent setup", StringComparison.OrdinalIgnoreCase))
        {
            merged = existing.TrimEnd()
                + Environment.NewLine + Environment.NewLine
                + snippet;
        }
        else
        {
            return;
        }

        if (!merged.EndsWith(Environment.NewLine, StringComparison.Ordinal))
        {
            merged += Environment.NewLine;
        }

        File.WriteAllText(destPath, merged, System.Text.Encoding.UTF8);
    }
}
