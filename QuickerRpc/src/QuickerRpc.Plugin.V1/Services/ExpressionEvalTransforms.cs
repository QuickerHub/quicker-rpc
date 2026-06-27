using System;
using System.Text.RegularExpressions;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Shared expression rewrites for Z.Expressions (plugin backfill and <c>expr run</c>).
/// </summary>
internal static class ExpressionEvalTransforms
{
    // Z.Expressions: Split on dynamic v_* yields dynamic; cast source to string, keep var for ToList() chains.
    private static readonly Regex SplitAssignPattern = new(
        @"\bvar\s+(?<lines>\w+)\s*=\s*(?<src>v_\w+)\s*\.Split\s*\(",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    /// <summary>
    /// Rewrites <c>var lines = v_x.Split(</c> to <c>var lines = ((string)v_x).Split(</c> (keep <c>var</c>).
    /// </summary>
    public static string EnsureTypedSplitAssignment(string expression) =>
        SplitAssignPattern.Replace(expression, match =>
        {
            var lines = match.Groups["lines"].Value;
            var src = match.Groups["src"].Value;
            return $"var {lines} = ((string){src}).Split(";
        });
}
