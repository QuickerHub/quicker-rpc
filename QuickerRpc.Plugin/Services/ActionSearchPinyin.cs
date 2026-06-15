using System;
using System.Reflection;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Pinyin matching via Quicker's <c>Quicker.Utilities.Pinyin.PinyinHelper</c>
/// (same algorithm as the main UI search box).
/// </summary>
internal static class ActionSearchPinyin
{
    private static readonly object BridgeLock = new();
    private static bool _bridgeResolved;
    private static PinyinBridge? _bridge;

    public static bool IsAsciiPinyinQuery(string normalizedKeyword)
    {
        if (normalizedKeyword.Length == 0)
        {
            return false;
        }

        var hasLetter = false;
        foreach (var ch in normalizedKeyword)
        {
            if (ch > 127)
            {
                return false;
            }

            if (char.IsLetter(ch))
            {
                hasLetter = true;
            }
            else if (!char.IsDigit(ch))
            {
                return false;
            }
        }

        return hasLetter;
    }

    public static int ScoreText(string text, string normalizedKeyword)
    {
        if (!IsAsciiPinyinQuery(normalizedKeyword) || string.IsNullOrEmpty(text))
        {
            return 0;
        }

        var bridge = GetBridge();
        if (bridge is null)
        {
            return 0;
        }

        if (!bridge.IsMatch(text, normalizedKeyword))
        {
            return 0;
        }

        try
        {
            var matchString = bridge.GetMatchString(text);
            if (bridge.IsMatchEx(matchString, normalizedKeyword, true, true))
            {
                return 105;
            }

            if (bridge.IsMatchEx(matchString, normalizedKeyword, true, false))
            {
                return 95;
            }
        }
        catch
        {
            // Fall back to the simple match score below.
        }

        return 85;
    }

    /// <summary>Pinyin match for a single pattern (used when FastMatcher bridge is unavailable).</summary>
    internal static bool TryPinyinMatch(string text, string pattern)
    {
        if (string.IsNullOrEmpty(text) || string.IsNullOrEmpty(pattern))
        {
            return false;
        }

        if (!IsAsciiPinyinQuery(pattern))
        {
            return false;
        }

        var bridge = GetBridge();
        return bridge is not null && bridge.IsMatch(text, pattern);
    }

    private static PinyinBridge? GetBridge()
    {
        if (_bridgeResolved)
        {
            return _bridge;
        }

        lock (BridgeLock)
        {
            if (_bridgeResolved)
            {
                return _bridge;
            }

            try
            {
                _bridge = CreateBridge();
            }
            catch
            {
                _bridge = null;
            }

            _bridgeResolved = true;
            return _bridge;
        }
    }

    private static PinyinBridge? CreateBridge()
    {
        var helperType = QuickerPinyinReflection.TryResolvePinyinHelperType();
        if (helperType is null)
        {
            return null;
        }

        var isMatchSimple = helperType.GetMethod(
            "IsPinyinMatch",
            BindingFlags.Public | BindingFlags.Static,
            binder: null,
            types: new[] { typeof(string), typeof(string) },
            modifiers: null);
        var isMatchEx = helperType.GetMethod(
            "IsPinyinMatch",
            BindingFlags.Public | BindingFlags.Static,
            binder: null,
            types: new[] { typeof(string), typeof(string), typeof(bool), typeof(bool) },
            modifiers: null);
        var getMatchString = helperType.GetMethod(
            "GetPinYinMatchString",
            BindingFlags.Public | BindingFlags.Static,
            binder: null,
            types: new[] { typeof(string) },
            modifiers: null);
        if (isMatchSimple is null || isMatchEx is null || getMatchString is null)
        {
            return null;
        }

        return new PinyinBridge
        {
            IsMatch = (text, query) =>
                isMatchSimple.Invoke(null, new object[] { text, query }) is true,
            IsMatchEx = (text, query, fromStart, onlyFirstChar) =>
                isMatchEx.Invoke(null, new object[] { text, query, fromStart, onlyFirstChar }) is true,
            GetMatchString = text =>
                getMatchString.Invoke(null, new object[] { text }) as string ?? string.Empty,
        };
    }

    private sealed class PinyinBridge
    {
        public Func<string, string, bool> IsMatch { get; set; } = null!;
        public Func<string, string, bool, bool, bool> IsMatchEx { get; set; } = null!;
        public Func<string, string> GetMatchString { get; set; } = null!;
    }
}
