// Ported from Quicker Quicker.Ai.Workspace, revision 574556d76b0b10bd9a8a7951277435649650fab8.
using System;

namespace QuickerRpc.AgentModel.XAction.Source;

/// <summary>Canonical <c>sys:</c> runner key prefix rules for CAW.</summary>
internal static class SysRunnerKey
{
    private const string CanonicalPrefix = "sys:";

    /// <summary>
    /// Normalize a case-variant <c>sys:</c> prefix (e.g. <c>SYS:foo</c>) to canonical lowercase.
    /// Returns false when the key is already canonical or not a single-segment sys namespace key.
    /// </summary>
    public static bool TryNormalizePrefix(string runnerKey, out string normalized)
    {
        normalized = runnerKey;
        if (runnerKey.StartsWith(CanonicalPrefix, StringComparison.Ordinal))
        {
            return false;
        }

        if (!runnerKey.StartsWith(CanonicalPrefix, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var colon = runnerKey.IndexOf(':');
        if (colon != 3
            || !string.Equals(runnerKey.Substring(0, 3), "sys", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        normalized = CanonicalPrefix + runnerKey.Substring(colon + 1);
        return true;
    }
}
