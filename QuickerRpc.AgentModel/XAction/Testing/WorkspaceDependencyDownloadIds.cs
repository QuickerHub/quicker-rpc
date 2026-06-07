using System;

namespace QuickerRpc.AgentModel.XAction.Testing;

/// <summary>Known global subprogram ids for dependency download (混合模式).</summary>
public static class WorkspaceDependencyDownloadIds
{
    /// <summary><c>依赖下载_混合模式_v2</c> — scan side-by-side revisions, output dll_path / exe_path.</summary>
    public const string MixedModeV2 = "a7d5c0aa-80a5-4b5b-9bd1-a41bab5b2053";

    /// <summary>Legacy dependency download subprogram (package_path / version outputs).</summary>
    public const string LegacyMixedMode = "9ed444ec-0899-48c3-8207-da51c4acec2f";

    public static bool IsDependencyDownloadSubprogram(string? callIdentifierOrId)
    {
        var id = NormalizeSubprogramId(callIdentifierOrId);
        if (id.Length == 0)
        {
            return false;
        }

        return string.Equals(id, MixedModeV2, StringComparison.OrdinalIgnoreCase)
            || string.Equals(id, LegacyMixedMode, StringComparison.OrdinalIgnoreCase);
    }

    public static string NormalizeSubprogramId(string? callIdentifierOrId)
    {
        var raw = (callIdentifierOrId ?? string.Empty).Trim();
        if (raw.StartsWith("%%", StringComparison.Ordinal))
        {
            raw = raw.Substring(2);
        }

        return raw;
    }
}
