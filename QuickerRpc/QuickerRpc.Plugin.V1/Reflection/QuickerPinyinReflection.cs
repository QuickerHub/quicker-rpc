using System;
using System.IO;
using System.Linq;
using System.Reflection;

namespace QuickerRpc.Plugin.Reflection;

/// <summary>
/// Resolves Quicker pinyin types: <c>PinyinHelper</c> (Quicker.Public) and
/// <c>FastMatcher</c> (Quicker.exe; obfuscated in Release — signature scan).
/// </summary>
internal static class QuickerPinyinReflection
{
    internal const string PinyinHelperTypeName = "Quicker.Utilities.Pinyin.PinyinHelper";
    internal const string IMatchResultTypeName = "Quicker.Utilities.Pinyin.IMatchResult";
    internal const string FastMatcherTypeName = "Quicker.Pinyin.Fast1.FastMatcher";
    internal const string MatchHelperTypeName = "Quicker.Modules.Pinyin.MatchHelper";

    internal static Type? TryResolvePinyinHelperType()
    {
        try
        {
            var fromPublic = TryLoadTypeFromPublicDll(PinyinHelperTypeName);
            if (fromPublic is not null)
            {
                return fromPublic;
            }

            var fromLoaded = TryFindTypeInLoadedAssemblies(PinyinHelperTypeName);
            if (fromLoaded is not null)
            {
                return fromLoaded;
            }

            if (QuickerAssemblyReflection.TryResolveQuickerEntryAssembly(out var entry))
            {
                var fromEntry = QuickerAssemblyReflection.TryGetTypeByFullName(entry, PinyinHelperTypeName);
                if (fromEntry is not null)
                {
                    return fromEntry;
                }
            }

            return null;
        }
        catch
        {
            return null;
        }
    }

    internal static Type? TryResolveFastMatcherType(Assembly? quickerAssembly = null)
    {
        try
        {
            if (quickerAssembly is not null)
            {
                var fromLoaded = QuickerAssemblyReflection.TryGetTypeByFullName(
                    quickerAssembly,
                    FastMatcherTypeName);
                if (fromLoaded is not null)
                {
                    return fromLoaded;
                }

                return TryResolveFastMatcherBySignature(quickerAssembly);
            }

            if (QuickerAssemblyReflection.TryResolveQuickerEntryAssembly(out var entry))
            {
                var fromName = QuickerAssemblyReflection.TryGetTypeByFullName(entry, FastMatcherTypeName);
                if (fromName is not null)
                {
                    return fromName;
                }

                var fromSignature = TryResolveFastMatcherBySignature(entry);
                if (fromSignature is not null)
                {
                    return fromSignature;
                }
            }

            return null;
        }
        catch
        {
            return null;
        }
    }

    internal static MethodInfo? TryGetFastMatcherGetMatchResult(Type fastMatcherType)
    {
        var matchResultType = TryResolveIMatchResultType();
        if (matchResultType is null)
        {
            return null;
        }

        foreach (var method in fastMatcherType.GetMethods(QuickerAssemblyReflection.StaticFlags))
        {
            if (method.IsGenericMethod)
            {
                continue;
            }

            var parameters = method.GetParameters();
            if (parameters.Length != 2
                || parameters[0].ParameterType != typeof(string)
                || parameters[1].ParameterType != typeof(string[]))
            {
                continue;
            }

            if (matchResultType.IsAssignableFrom(method.ReturnType))
            {
                return method;
            }
        }

        return null;
    }

    internal static MethodInfo? TryGetFastMatcherIsMatch(Type fastMatcherType)
    {
        var direct = fastMatcherType.GetMethod(
            "IsMatch",
            QuickerAssemblyReflection.StaticFlags,
            binder: null,
            types: new[] { typeof(string), typeof(string[]) },
            modifiers: null);
        return direct is not null && direct.ReturnType == typeof(bool) ? direct : null;
    }

    private static Type? TryResolveFastMatcherBySignature(Assembly assembly)
    {
        try
        {
            var matchResultType = TryResolveIMatchResultType();
            if (matchResultType is null)
            {
                return null;
            }

            Type? candidate = null;
            foreach (var type in QuickerAssemblyReflection.EnumerateTypes(assembly))
            {
                if (!type.IsAbstract || !type.IsSealed)
                {
                    continue;
                }

                if (TryGetFastMatcherGetMatchResult(type) is null)
                {
                    continue;
                }

                if (TryGetFastMatcherIsMatch(type) is null)
                {
                    continue;
                }

                if (candidate is not null)
                {
                    return null;
                }

                candidate = type;
            }

            return candidate;
        }
        catch
        {
            return null;
        }
    }

    private static Type? TryResolveIMatchResultType()
    {
        var fromPublic = TryLoadTypeFromPublicDll(IMatchResultTypeName);
        if (fromPublic is not null)
        {
            return fromPublic;
        }

        return TryFindTypeInLoadedAssemblies(IMatchResultTypeName);
    }

    private static Type? TryLoadTypeFromPublicDll(string typeFullName)
    {
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
            return Assembly.LoadFrom(publicDll).GetType(typeFullName, throwOnError: false);
        }
        catch
        {
            return null;
        }
    }

    private static Type? TryFindTypeInLoadedAssemblies(string typeFullName)
    {
        foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            if (assembly.IsDynamic)
            {
                continue;
            }

            try
            {
                var type = assembly.GetType(typeFullName, throwOnError: false);
                if (type is not null)
                {
                    return type;
                }
            }
            catch
            {
                // Skip broken assembly loads during offline scans.
            }
        }

        return Type.GetType($"{typeFullName}, Quicker.Public", throwOnError: false);
    }
}
