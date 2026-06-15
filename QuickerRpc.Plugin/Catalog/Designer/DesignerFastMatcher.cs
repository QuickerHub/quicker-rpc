using System;
using System.Linq;
using System.Reflection;
using QuickerRpc.Plugin.Reflection;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.Catalog.Designer;

/// <summary>
/// Bridge to Quicker <c>Quicker.Pinyin.Fast1.FastMatcher</c> for action-editor quick insert search.
/// Falls back to literal substring, then <see cref="ActionSearchPinyin"/> when FastMatcher cannot be resolved.
/// </summary>
internal static class DesignerFastMatcher
{
    internal const int MaxMatchLength = 128;

    private static readonly object MatcherLock = new();
    private static bool _matcherResolved;
    private static FastMatcherBridge? _matcher;

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

        var bridge = GetMatcherBridge();
        if (bridge is not null)
        {
            try
            {
                var raw = bridge.GetMatchResult(text, patterns);
                if (raw is not null)
                {
                    var wrapped = WrapResult(raw);
                    if (wrapped.IsMatch)
                    {
                        return wrapped;
                    }
                }
            }
            catch
            {
                // FastMatcher unavailable or failed; fall through to offline matchers.
            }
        }

        var literal = FallbackSubstringMatch(text, patterns);
        if (literal is not null)
        {
            return literal;
        }

        return TryPinyinMatchAll(text, patterns);
    }

    public static bool IsMatch(string? text, string[] patterns)
    {
        var result = GetMatchResult(text, patterns);
        return result is not null && result.IsMatch;
    }

    private static MatchResult? TryPinyinMatchAll(string text, string[] patterns)
    {
        if (!patterns.All(ActionSearchPinyin.IsAsciiPinyinQuery))
        {
            return null;
        }

        foreach (var p in patterns)
        {
            if (string.IsNullOrEmpty(p) || !ActionSearchPinyin.TryPinyinMatch(text, p))
            {
                return null;
            }
        }

        var score = patterns.Length == 1
            ? ActionSearchPinyin.ScoreText(text, patterns[0])
            : 85;
        if (score <= 0)
        {
            score = 85;
        }

        return new MatchResult(true, score, _ => false);
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

    private static FastMatcherBridge? GetMatcherBridge()
    {
        if (_matcherResolved)
        {
            return _matcher;
        }

        lock (MatcherLock)
        {
            if (_matcherResolved)
            {
                return _matcher;
            }

            try
            {
                _matcher = CreateFastMatcherBridge();
            }
            catch
            {
                _matcher = null;
            }

            _matcherResolved = true;
            return _matcher;
        }
    }

    private static FastMatcherBridge? CreateFastMatcherBridge()
    {
        var matcherType = QuickerPinyinReflection.TryResolveFastMatcherType();
        if (matcherType is null)
        {
            return null;
        }

        var getMatchArray = QuickerPinyinReflection.TryGetFastMatcherGetMatchResult(matcherType);
        var isMatchArray = QuickerPinyinReflection.TryGetFastMatcherIsMatch(matcherType);
        if (getMatchArray is null || isMatchArray is null)
        {
            return null;
        }

        return new FastMatcherBridge
        {
            GetMatchResult = (text, patterns) =>
                getMatchArray.Invoke(null, new object[] { text, patterns }),
            IsMatchArray = (text, patterns) =>
                isMatchArray.Invoke(null, new object[] { text, patterns }) is true,
        };
    }

    private sealed class FastMatcherBridge
    {
        public Func<string, string[], object?> GetMatchResult { get; set; } = null!;

        public Func<string, string[], bool> IsMatchArray { get; set; } = null!;
    }
}
