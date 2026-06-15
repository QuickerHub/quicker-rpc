using System;
using System.IO;
using System.Reflection;

namespace QuickerRpc.Plugin.Catalog.Designer;

/// <summary>
/// Reflection bridge to Quicker <c>Quicker.Pinyin.Fast1.FastMatcher</c> for action-editor search.
/// </summary>
internal static class DesignerFastMatcher
{
    internal const int MaxMatchLength = 128;

    private static readonly Lazy<Bridge?> Matcher = new(CreateBridge);

    internal sealed class MatchResult
    {
        public bool IsMatch { get; init; }

        public int Score { get; init; }

        private readonly Func<int, bool> _getPosition;

        public MatchResult(bool isMatch, int score, Func<int, bool> getPosition)
        {
            IsMatch = isMatch;
            Score = score;
            _getPosition = getPosition;
        }

        public bool GetPosition(int pos) => _getPosition(pos);
    }

    public static MatchResult? GetMatchResult(string? text, string[] patterns)
    {
        if (string.IsNullOrEmpty(text) || patterns is null || patterns.Length == 0)
        {
            return null;
        }

        var bridge = Matcher.Value;
        if (bridge is null)
        {
            return FallbackSubstringMatch(text, patterns);
        }

        try
        {
            var raw = bridge.GetMatchResult(text, patterns);
            if (raw is null)
            {
                return null;
            }

            return WrapResult(raw);
        }
        catch
        {
            return FallbackSubstringMatch(text, patterns);
        }
    }

    public static bool IsMatch(string? text, string[] patterns)
    {
        if (string.IsNullOrEmpty(text) || patterns is null || patterns.Length == 0)
        {
            return false;
        }

        var bridge = Matcher.Value;
        if (bridge is null)
        {
            return FallbackSubstringMatch(text, patterns)?.IsMatch == true;
        }

        try
        {
            return bridge.IsMatchArray(text, patterns);
        }
        catch
        {
            return FallbackSubstringMatch(text, patterns)?.IsMatch == true;
        }
    }

    private static MatchResult? FallbackSubstringMatch(string text, string[] patterns)
    {
        var hits = new bool[Math.Min(text.Length, MaxMatchLength)];
        var any = false;
        foreach (var p in patterns)
        {
            if (string.IsNullOrEmpty(p))
            {
                continue;
            }

            var start = 0;
            while (start <= text.Length - p.Length)
            {
                var idx = text.IndexOf(p, start, StringComparison.OrdinalIgnoreCase);
                if (idx < 0)
                {
                    break;
                }

                any = true;
                for (var i = idx; i < idx + p.Length && i < hits.Length; i++)
                {
                    hits[i] = true;
                }

                start = idx + 1;
            }
        }

        if (!any)
        {
            return null;
        }

        return new MatchResult(true, 1, pos => pos >= 0 && pos < hits.Length && hits[pos]);
    }

    private static MatchResult WrapResult(object raw)
    {
        var type = raw.GetType();
        var scoreProp = type.GetProperty("Score", BindingFlags.Instance | BindingFlags.Public);
        var isMatchProp = type.GetProperty("IsMatch", BindingFlags.Instance | BindingFlags.Public);
        var getPosition = type.GetMethod("GetPosition", BindingFlags.Instance | BindingFlags.Public);
        var score = scoreProp?.GetValue(raw) is int s ? s : 0;
        var isMatch = isMatchProp?.GetValue(raw) is bool b ? b : score > 0;
        return new MatchResult(
            isMatch,
            score,
            pos => getPosition?.Invoke(raw, new object[] { pos }) is true);
    }

    private static Bridge? CreateBridge()
    {
        var matcherType = ResolveType("Quicker.Pinyin.Fast1.FastMatcher");
        if (matcherType is null)
        {
            return null;
        }

        var getMatchResult = matcherType.GetMethod(
            "GetMatchResult",
            BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static,
            binder: null,
            types: new[] { typeof(string), typeof(string[]) },
            modifiers: null);
        var isMatchArray = matcherType.GetMethod(
            "IsMatch",
            BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static,
            binder: null,
            types: new[] { typeof(string), typeof(string[]) },
            modifiers: null);
        if (getMatchResult is null || isMatchArray is null)
        {
            return null;
        }

        return new Bridge
        {
            GetMatchResult = (text, patterns) =>
                getMatchResult.Invoke(null, new object[] { text, patterns }),
            IsMatchArray = (text, patterns) =>
                isMatchArray.Invoke(null, new object[] { text, patterns }) is true,
        };
    }

    private static Type? ResolveType(string typeName)
    {
        var type = Type.GetType(typeName + ", Quicker", throwOnError: false);
        if (type is not null)
        {
            return type;
        }

        foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            type = assembly.GetType(typeName, throwOnError: false);
            if (type is not null)
            {
                return type;
            }
        }

        var quickerDir = Environment.GetEnvironmentVariable("QUICKER_DLL_PATH");
        if (string.IsNullOrWhiteSpace(quickerDir))
        {
            quickerDir = @"C:\Program Files\Quicker";
        }

        foreach (var dll in new[] { "Quicker.exe", "Quicker.Public.dll" })
        {
            var path = Path.Combine(quickerDir, dll);
            if (!File.Exists(path))
            {
                continue;
            }

            try
            {
                type = Assembly.LoadFrom(path).GetType(typeName, throwOnError: false);
                if (type is not null)
                {
                    return type;
                }
            }
            catch
            {
                // try next
            }
        }

        return null;
    }

    private sealed class Bridge
    {
        public Func<string, string[], object?> GetMatchResult { get; set; } = null!;

        public Func<string, string[], bool> IsMatchArray { get; set; } = null!;
    }
}
