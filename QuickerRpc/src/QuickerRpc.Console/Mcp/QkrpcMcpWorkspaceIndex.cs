using System.Text.Json;
using System.Text.Json.Serialization;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.Console.Mcp;

internal static class QkrpcMcpWorkspaceIndex
{
    internal const string RelativePath = ".quicker/index.json";

    internal static string GetQuickerRoot(string workspaceRoot) =>
        QuickerProjectLayout.GetQuickerRoot(workspaceRoot);

    internal static string GetIndexPath(string workspaceRoot) =>
        Path.Combine(workspaceRoot, RelativePath);

    internal static WorkspaceIndexDocument Build(string workspaceRoot)
    {
        var root = Path.GetFullPath(workspaceRoot);
        var quickerRoot = GetQuickerRoot(root);
        var doc = new WorkspaceIndexDocument
        {
            WorkspaceRoot = root,
            QuickerRoot = quickerRoot,
            GeneratedAt = DateTime.UtcNow.ToString("o"),
            Projects = [],
        };

        IndexKindRoot(doc, QuickerProjectKind.Action, "action", root);
        IndexKindRoot(doc, QuickerProjectKind.SubProgram, "global_subprogram", root);
        return doc;
    }

    internal static string Write(string workspaceRoot)
    {
        var doc = Build(workspaceRoot);
        var path = GetIndexPath(workspaceRoot);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var json = JsonSerializer.Serialize(doc, JsonOptions);
        File.WriteAllText(path, json + Environment.NewLine, System.Text.Encoding.UTF8);
        return path;
    }

    internal static string? TryRead(string workspaceRoot)
    {
        var path = GetIndexPath(workspaceRoot);
        return File.Exists(path) ? File.ReadAllText(path, System.Text.Encoding.UTF8) : null;
    }

    internal static void EnsureReadme(string workspaceRoot)
    {
        var path = Path.Combine(workspaceRoot, QkrpcMcpWorkspaceReadme.RelativePath);
        if (File.Exists(path))
        {
            return;
        }

        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, QkrpcMcpWorkspaceReadme.Content, System.Text.Encoding.UTF8);
    }

    private static void IndexKindRoot(
        WorkspaceIndexDocument doc,
        QuickerProjectKind kind,
        string targetKind,
        string workspaceRoot)
    {
        var kindRoot = QuickerProjectLayout.GetKindRoot(kind, workspaceRoot);
        if (!Directory.Exists(kindRoot))
        {
            return;
        }

        foreach (var projectDir in Directory.EnumerateDirectories(kindRoot))
        {
            try
            {
                doc.Projects.Add(IndexProject(projectDir, workspaceRoot, targetKind));
            }
            catch
            {
                // skip invalid dirs
            }
        }
    }

    private static WorkspaceIndexProject IndexProject(
        string projectDir,
        string workspaceRoot,
        string targetKind)
    {
        var relDir = Path.GetRelativePath(workspaceRoot, projectDir).Replace('\\', '/');
        var files = ListRelativeFiles(projectDir, workspaceRoot);
        string? id = null;
        string? title = null;
        long? editVersion = null;

        if (File.Exists(QuickerProjectLayout.GetInfoPath(projectDir)))
        {
            if (targetKind == "action")
            {
                var info = QuickerProjectFiles.ReadActionInfo(projectDir);
                id = ActionProjectIdentity.FromInfoOrDirectory(info, projectDir);
                title = info.Title;
                editVersion = info.EditVersion;
            }
            else
            {
                var info = QuickerProjectFiles.ReadSubProgramInfo(projectDir);
                id = info.Id ?? info.Name;
                title = info.Name;
                editVersion = info.EditVersion;
            }
        }

        var embedded = new List<WorkspaceIndexProject>();
        var embeddedRoot = QuickerProjectLayout.GetActionEmbeddedSubProgramsRoot(projectDir);
        if (Directory.Exists(embeddedRoot))
        {
            foreach (var subDir in Directory.EnumerateDirectories(embeddedRoot))
            {
                embedded.Add(IndexProject(subDir, workspaceRoot, "embedded_subprogram"));
            }
        }

        return new WorkspaceIndexProject
        {
            Target = targetKind,
            Id = id ?? Path.GetFileName(projectDir),
            Title = title,
            EditVersion = editVersion,
            ProjectDir = relDir,
            DataJson = File.Exists(QuickerProjectLayout.GetDataPath(projectDir))
                ? relDir + "/data.json"
                : null,
            Files = files,
            EmbeddedSubprograms = embedded.Count > 0 ? embedded : null,
        };
    }

    private static List<string> ListRelativeFiles(string projectDir, string workspaceRoot)
    {
        var list = new List<string>();
        foreach (var file in Directory.EnumerateFiles(projectDir, "*", SearchOption.AllDirectories))
        {
            list.Add(Path.GetRelativePath(workspaceRoot, file).Replace('\\', '/'));
        }

        list.Sort(StringComparer.OrdinalIgnoreCase);
        return list;
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = true,
    };
}

internal sealed class WorkspaceIndexDocument
{
    public string WorkspaceRoot { get; set; } = string.Empty;

    public string QuickerRoot { get; set; } = string.Empty;

    public string GeneratedAt { get; set; } = string.Empty;

    public List<WorkspaceIndexProject> Projects { get; set; } = [];
}

internal sealed class WorkspaceIndexProject
{
    public string Target { get; set; } = string.Empty;

    public string Id { get; set; } = string.Empty;

    public string? Title { get; set; }

    public long? EditVersion { get; set; }

    public string ProjectDir { get; set; } = string.Empty;

    public string? DataJson { get; set; }

    public List<string> Files { get; set; } = [];

    public List<WorkspaceIndexProject>? EmbeddedSubprograms { get; set; }
}
