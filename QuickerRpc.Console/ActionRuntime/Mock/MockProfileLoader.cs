using System.Text.Json;

namespace QuickerRpc.Console.ActionRuntime.Mock;

internal static class MockProfileLoader
{
    private static readonly string ProfilesDir = Path.Combine(
        AppContext.BaseDirectory,
        "..",
        "..",
        "..",
        "..",
        "agent-gui",
        "benchmarks",
        "mock-profiles");

    internal static string ResolveProfilesDirectory()
    {
        var bundled = Path.Combine(AppContext.BaseDirectory, "benchmarks", "mock-profiles");
        if (Directory.Exists(bundled))
        {
            return bundled;
        }

        var workspaceRoot = Environment.GetEnvironmentVariable("QKRPC_WORKSPACE_ROOT");
        if (!string.IsNullOrWhiteSpace(workspaceRoot))
        {
            var fromWorkspace = Path.GetFullPath(
                Path.Combine(
                    workspaceRoot.Trim(),
                    "agent-gui",
                    "benchmarks",
                    "mock-profiles"));
            if (Directory.Exists(fromWorkspace))
            {
                return fromWorkspace;
            }
        }

        var repoRelative = Path.GetFullPath(
            Path.Combine(
                FindRepoRoot(),
                "agent-gui",
                "benchmarks",
                "mock-profiles"));
        if (Directory.Exists(repoRelative))
        {
            return repoRelative;
        }

        return Path.GetFullPath(ProfilesDir);
    }

    internal static MockProfileDocument Load(string? profileId, string? profileFile)
    {
        if (!string.IsNullOrWhiteSpace(profileFile))
        {
            var path = Path.GetFullPath(profileFile.Trim());
            if (!File.Exists(path))
            {
                throw new FileNotFoundException($"Mock profile file not found: {path}", path);
            }

            return Deserialize(File.ReadAllText(path));
        }

        if (string.IsNullOrWhiteSpace(profileId))
        {
            throw new InvalidOperationException("Provide --mock-profile <id> or --mock-profile-file <path>.");
        }

        var dir = ResolveProfilesDirectory();
        var byId = Path.Combine(dir, $"{profileId.Trim()}.json");
        if (!File.Exists(byId))
        {
            throw new FileNotFoundException(
                $"Mock profile '{profileId}' not found at {byId}. Expected agent-gui/benchmarks/mock-profiles/{profileId}.json",
                byId);
        }

        return Deserialize(File.ReadAllText(byId));
    }

    internal static IReadOnlyList<string> ListProfileIds()
    {
        var dir = ResolveProfilesDirectory();
        if (!Directory.Exists(dir))
        {
            return Array.Empty<string>();
        }

        return Directory.GetFiles(dir, "*.json")
            .Select(Path.GetFileNameWithoutExtension)
            .Where(static name => !string.IsNullOrWhiteSpace(name) && !name!.StartsWith("_", StringComparison.Ordinal))
            .OrderBy(static name => name, StringComparer.OrdinalIgnoreCase)
            .Cast<string>()
            .ToList();
    }

    private static MockProfileDocument Deserialize(string json)
    {
        var profile = JsonSerializer.Deserialize<MockProfileDocument>(json, QkrpcJson.CliOutput)
            ?? throw new InvalidOperationException("Mock profile JSON is empty.");
        return profile;
    }

    private static string FindRepoRoot()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "version.json"))
                && Directory.Exists(Path.Combine(dir.FullName, "agent-gui")))
            {
                return dir.FullName;
            }

            dir = dir.Parent;
        }

        return Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", ".."));
    }
}
