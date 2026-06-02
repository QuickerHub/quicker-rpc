using System;

namespace QuickerRpc.Plugin.Services;

internal static class SemVerUtility
{
    public static bool TryParse(string? value, out Version version)
    {
        version = new Version(0, 0, 0);
        var trimmed = (value ?? string.Empty).Trim();
        if (trimmed.Length == 0)
        {
            return false;
        }

        if (trimmed.StartsWith("v", StringComparison.OrdinalIgnoreCase))
        {
            trimmed = trimmed.Substring(1);
        }

        var parts = trimmed.Split('.');
        if (parts.Length < 2 || parts.Length > 4)
        {
            return false;
        }

        if (!int.TryParse(parts[0], out var major)
            || !int.TryParse(parts[1], out var minor))
        {
            return false;
        }

        var build = 0;
        var revision = 0;
        if (parts.Length >= 3 && !int.TryParse(parts[2], out build))
        {
            return false;
        }

        if (parts.Length >= 4 && !int.TryParse(parts[3], out revision))
        {
            return false;
        }

        version = new Version(major, minor, build, revision);
        return true;
    }

    /// <summary>Returns positive when <paramref name="left"/> is newer than <paramref name="right"/>.</summary>
    public static int Compare(string? left, string? right)
    {
        if (!TryParse(left, out var leftVersion))
        {
            return TryParse(right, out _) ? -1 : 0;
        }

        if (!TryParse(right, out var rightVersion))
        {
            return 1;
        }

        return leftVersion.CompareTo(rightVersion);
    }
}
