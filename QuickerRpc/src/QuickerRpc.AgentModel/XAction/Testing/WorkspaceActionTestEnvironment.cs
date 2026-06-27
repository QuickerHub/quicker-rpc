using System;
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json.Linq;
using QuickerRpc.AgentModel.XAction.Project;

namespace QuickerRpc.AgentModel.XAction.Testing;

/// <summary>
/// Load and compile <c>.quicker/actions/</c> disk projects for offline / live action tests.
/// </summary>
public static class WorkspaceActionTestEnvironment
{
    public const string WorkspaceRootEnvVar = "QKRPC_WORKSPACE_ROOT";

    public const string RepoRootMarkerFile = "version.json";

    public const string PluginProjectDirName = "QuickerRpc.Plugin";

    /// <summary>Summary of one action project under <c>.quicker/actions/</c>.</summary>
    public sealed class ProjectSummary
    {
        public string ProjectDirectory { get; set; } = string.Empty;

        public string RelativeDirectory { get; set; } = string.Empty;

        public string? ActionId { get; set; }

        public string? Title { get; set; }

        public bool HasData { get; set; }

        public int StepCount { get; set; }

        public int VariableCount { get; set; }
    }

    /// <summary>Compiled workspace action ready for apply / run.</summary>
    public sealed class LoadedProject
    {
        public string WorkspaceRoot { get; set; } = string.Empty;

        public string ProjectDirectory { get; set; } = string.Empty;

        public string RelativeDirectory { get; set; } = string.Empty;

        public string? ActionId { get; set; }

        public string? Title { get; set; }

        public long? EditVersion { get; set; }

        public JObject DiskData { get; set; } = new JObject();

        public JObject CompiledData { get; set; } = new JObject();

        public string CompiledJson => CompiledData.ToString(Newtonsoft.Json.Formatting.None);
    }

    public sealed class LoadResult
    {
        public bool Success { get; set; }

        public string? ErrorMessage { get; set; }

        public LoadedProject? Project { get; set; }
    }

    /// <summary>
    /// Repo root: <paramref name="overrideRoot"/> → <see cref="WorkspaceRootEnvVar"/> → walk up from cwd/base dir.
    /// </summary>
    public static string ResolveWorkspaceRoot(string? overrideRoot = null)
    {
        var trimmed = (overrideRoot ?? string.Empty).Trim();
        if (trimmed.Length > 0)
        {
            return Path.GetFullPath(trimmed);
        }

        var fromEnv = Environment.GetEnvironmentVariable(WorkspaceRootEnvVar)?.Trim();
        if (!string.IsNullOrEmpty(fromEnv))
        {
            return Path.GetFullPath(fromEnv);
        }

        return ResolveRepoRootFromMarkers();
    }

    public static IReadOnlyList<ProjectSummary> ListActionProjects(string? workspaceRoot = null)
    {
        var root = ResolveWorkspaceRoot(workspaceRoot);
        var actionsRoot = QuickerProjectLayout.GetKindRoot(QuickerProjectKind.Action, root);
        if (!Directory.Exists(actionsRoot))
        {
            return Array.Empty<ProjectSummary>();
        }

        var list = new List<ProjectSummary>();
        foreach (var dir in Directory.EnumerateDirectories(actionsRoot))
        {
            if (!TrySummarizeProject(dir, root, out var summary))
            {
                continue;
            }

            list.Add(summary!);
        }

        list.Sort((a, b) => string.Compare(a.RelativeDirectory, b.RelativeDirectory, StringComparison.OrdinalIgnoreCase));
        return list;
    }

    public static LoadResult TryLoad(
        string actionIdOrDirectoryName,
        string? workspaceRoot = null)
    {
        var key = (actionIdOrDirectoryName ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            return Fail("actionIdOrDirectoryName is required.");
        }

        var root = ResolveWorkspaceRoot(workspaceRoot);
        string? projectDir = null;

        if (Directory.Exists(key))
        {
            projectDir = Path.GetFullPath(key);
        }
        else if (Path.IsPathRooted(key))
        {
            return Fail($"Project directory not found: {key}");
        }
        else
        {
            projectDir = ActionProjectCatalog.FindActionProjectDirectoryByActionId(key, root);
            if (projectDir is null)
            {
                var candidate = Path.Combine(
                    QuickerProjectLayout.GetKindRoot(QuickerProjectKind.Action, root),
                    QuickerProjectLayout.SanitizeDirectoryName(key));
                if (Directory.Exists(candidate))
                {
                    projectDir = candidate;
                }
            }
        }

        if (projectDir is null)
        {
            return Fail($"No .quicker/actions project found for '{key}' under {root}.");
        }

        return TryLoadFromDirectory(projectDir, root);
    }

    public static LoadResult TryLoadFromDirectory(string projectDirectory, string? workspaceRoot = null)
    {
        var projectDir = QuickerProjectLayout.ResolveProjectDirectory(projectDirectory);
        var root = ResolveWorkspaceRoot(workspaceRoot);

        if (!QuickerProjectFiles.TryReadDataIfExists(projectDir, out var diskData) || diskData is null)
        {
            return Fail($"data.json missing or invalid: {QuickerProjectLayout.GetDataPath(projectDir)}");
        }

        WorkspaceProgramCompatibility.Normalize(diskData);

        var validate = XActionFileRefValidator.Validate(diskData, projectDir);
        if (!validate.Success)
        {
            return Fail(validate.ErrorMessage ?? "data.json validation failed.");
        }

        var compile = XActionFileRefCompiler.Compile(diskData, projectDir);
        if (!compile.Success || compile.CompiledData is null)
        {
            return Fail(compile.ErrorMessage ?? "file ref compile failed.");
        }

        string? actionId = null;
        string? title = null;
        long? editVersion = null;
        var infoPath = QuickerProjectLayout.GetInfoPath(projectDir);
        if (File.Exists(infoPath))
        {
            try
            {
                var info = QuickerProjectFiles.ReadActionInfo(projectDir);
                actionId = ActionProjectIdentity.FromInfoOrDirectory(info, projectDir);
                title = info.Title;
                editVersion = info.EditVersion > 0 ? info.EditVersion : null;
            }
            catch
            {
                actionId = ActionProjectIdentity.LooksLikeActionId(Path.GetFileName(projectDir))
                    ? Path.GetFileName(projectDir)
                    : null;
            }
        }
        else
        {
            actionId = ActionProjectIdentity.LooksLikeActionId(Path.GetFileName(projectDir))
                ? Path.GetFileName(projectDir)
                : null;
        }

        return new LoadResult
        {
            Success = true,
            Project = new LoadedProject
            {
                WorkspaceRoot = root,
                ProjectDirectory = projectDir,
                RelativeDirectory = ActionProjectCatalog.GetRelativeProjectDirectory(projectDir, root),
                ActionId = actionId,
                Title = title,
                EditVersion = editVersion,
                DiskData = diskData,
                CompiledData = compile.CompiledData,
            },
        };
    }

    /// <summary>Load <c>.quicker/subprograms/{idOrName}/</c> for offline inspection or future subprogram simulation.</summary>
    public static LoadResult TryLoadSubProgram(string subProgramKey, string? workspaceRoot = null)
    {
        var key = (subProgramKey ?? string.Empty).Trim().TrimStart('%');
        if (key.StartsWith("%", StringComparison.Ordinal))
        {
            key = key.TrimStart('%');
        }

        if (key.Length == 0)
        {
            return Fail("subProgramKey is required.");
        }

        var root = ResolveWorkspaceRoot(workspaceRoot);
        var subRoot = QuickerProjectLayout.GetKindRoot(QuickerProjectKind.SubProgram, root);
        if (!Directory.Exists(subRoot))
        {
            return Fail($"No .quicker/subprograms under {root}.");
        }

        string? projectDir = null;
        foreach (var dir in Directory.EnumerateDirectories(subRoot))
        {
            var dirName = Path.GetFileName(dir);
            if (string.Equals(dirName, key, StringComparison.OrdinalIgnoreCase))
            {
                projectDir = dir;
                break;
            }

            try
            {
                var info = QuickerProjectFiles.ReadSubProgramInfo(dir);
                if (string.Equals(info.Id, key, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(info.Name, key, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(info.CallIdentifier?.TrimStart('%'), key, StringComparison.OrdinalIgnoreCase))
                {
                    projectDir = dir;
                    break;
                }
            }
            catch
            {
                // ignore invalid project folders
            }
        }

        if (projectDir is null)
        {
            return Fail($"No .quicker/subprograms project found for '{key}'.");
        }

        return TryLoadFromDirectory(projectDir, root);
    }

    private static bool TrySummarizeProject(string projectDirectory, string workspaceRoot, out ProjectSummary? summary)
    {
        summary = null;
        try
        {
            var hasData = QuickerProjectFiles.TryReadDataIfExists(projectDirectory, out var data) && data is not null;
            var stepCount = 0;
            var variableCount = 0;
            if (hasData)
            {
                stepCount = data!["steps"] is JArray steps ? steps.Count : 0;
                variableCount = data["variables"] is JArray variables ? variables.Count : 0;
            }

            string? actionId = null;
            string? title = null;
            var infoPath = QuickerProjectLayout.GetInfoPath(projectDirectory);
            if (File.Exists(infoPath))
            {
                var info = QuickerProjectFiles.ReadActionInfo(projectDirectory);
                actionId = ActionProjectIdentity.FromInfoOrDirectory(info, projectDirectory);
                title = info.Title;
            }
            else
            {
                var dirName = Path.GetFileName(projectDirectory);
                if (ActionProjectIdentity.LooksLikeActionId(dirName))
                {
                    actionId = dirName;
                }
            }

            summary = new ProjectSummary
            {
                ProjectDirectory = projectDirectory,
                RelativeDirectory = ActionProjectCatalog.GetRelativeProjectDirectory(projectDirectory, workspaceRoot),
                ActionId = actionId,
                Title = title,
                HasData = hasData,
                StepCount = stepCount,
                VariableCount = variableCount,
            };
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static string ResolveRepoRootFromMarkers()
    {
        foreach (var start in new[] { AppContext.BaseDirectory, Directory.GetCurrentDirectory() })
        {
            var dir = new DirectoryInfo(start);
            while (dir is not null)
            {
                if (File.Exists(Path.Combine(dir.FullName, RepoRootMarkerFile))
                    || Directory.Exists(Path.Combine(dir.FullName, PluginProjectDirName)))
                {
                    return dir.FullName;
                }

                dir = dir.Parent;
            }
        }

        return Directory.GetCurrentDirectory();
    }

    private static LoadResult Fail(string message) =>
        new() { Success = false, ErrorMessage = message };
}
