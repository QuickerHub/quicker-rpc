using System;
using System.IO;
using System.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Pinyin matching via Quicker's <c>Quicker.Utilities.Pinyin.PinyinHelper</c>
/// (same algorithm as the main UI search box).
/// </summary>
internal static class ActionSearchPinyin
{
    private static readonly Lazy<PinyinBridge?> Bridge = new(CreateBridge);

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

        var bridge = Bridge.Value;
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

    private static PinyinBridge? CreateBridge()
    {
        var helperType = ResolvePinyinHelperType();
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

    private static Type? ResolvePinyinHelperType()
    {
        const string typeName = "Quicker.Utilities.Pinyin.PinyinHelper";

        var fromDomain = Type.GetType($"{typeName}, Quicker.Public", throwOnError: false);
        if (fromDomain is not null)
        {
            return fromDomain;
        }

        foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            var type = assembly.GetType(typeName, throwOnError: false);
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

        var publicDll = Path.Combine(quickerDir, "Quicker.Public.dll");
        if (!File.Exists(publicDll))
        {
            return null;
        }

        try
        {
            return Assembly.LoadFrom(publicDll).GetType(typeName, throwOnError: false);
        }
        catch
        {
            return null;
        }
    }

    private sealed class PinyinBridge
    {
        public Func<string, string, bool> IsMatch { get; set; } = null!;
        public Func<string, string, bool, bool, bool> IsMatchEx { get; set; } = null!;
        public Func<string, string> GetMatchString { get; set; } = null!;
    }
}
