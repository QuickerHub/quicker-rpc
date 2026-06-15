using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Text;

namespace QuickerRpc.Plugin.Reflection;

/// <summary>Shared Quicker.exe reflection helpers (runtime entry assembly + offline assembly scans).</summary>
internal static class QuickerAssemblyReflection
{
    internal const string QuickerEntryAssemblyName = "Quicker";
    internal const string AppStateTypeFullName = "Quicker.Domain.AppState";

    internal static readonly BindingFlags StaticFlags =
        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static;

    internal static readonly BindingFlags InstanceFlags =
        BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;

    public static bool TryResolveQuickerEntryAssembly(out Assembly quicker)
    {
        quicker = Assembly.GetEntryAssembly()!;
        return quicker is not null
               && !quicker.IsDynamic
               && string.Equals(quicker.GetName().Name, QuickerEntryAssemblyName, StringComparison.Ordinal);
    }

    public static bool TryLoadQuickerExe(string exePath, out Assembly? assembly)
    {
        if (string.IsNullOrWhiteSpace(exePath) || !File.Exists(exePath))
        {
            assembly = null;
            return false;
        }

        assembly = Assembly.LoadFrom(exePath);
        return true;
    }

    public static IEnumerable<Type> EnumerateTypes(Assembly assembly)
    {
        try
        {
            return assembly.GetTypes();
        }
        catch (ReflectionTypeLoadException ex) when (ex.Types is not null)
        {
            return ex.Types.Where(t => t is not null)!;
        }
        catch
        {
            return Array.Empty<Type>();
        }
    }

    public static Type? TryGetTypeByFullName(Assembly assembly, string typeFullName)
    {
        try
        {
            var direct = assembly.GetType(typeFullName, throwOnError: false, ignoreCase: false);
            if (direct is not null)
            {
                return direct;
            }

            foreach (var type in EnumerateTypes(assembly))
            {
                if (string.Equals(type.FullName, typeFullName, StringComparison.Ordinal))
                {
                    return type;
                }
            }
        }
        catch
        {
            return null;
        }

        return null;
    }

    public static Type? TryFindNamedType(Assembly assembly, string simpleTypeName)
    {
        var servicesFullName = "Quicker.Domain.Services." + simpleTypeName;
        var byFullName = assembly.GetType(servicesFullName, throwOnError: false, ignoreCase: false);
        if (byFullName is not null)
        {
            return byFullName;
        }

        foreach (var type in EnumerateTypes(assembly))
        {
            if (string.Equals(type.Name, simpleTypeName, StringComparison.Ordinal))
            {
                return type;
            }
        }

        return null;
    }

    public static Type? TryGetAppStateType(Assembly assembly) =>
        TryGetTypeByFullName(assembly, AppStateTypeFullName);

    public static void WriteMethodDetail(MethodInfo method, Action<string> writeLine)
    {
        writeLine("  Method: " + method.DeclaringType!.FullName + "." + method.Name);
        writeLine("    IsStatic: " + method.IsStatic);
        writeLine("    Return: " + FormatType(method.ReturnType));
        var parameters = method.GetParameters();
        writeLine("    Parameters (" + parameters.Length + "):");
        for (var i = 0; i < parameters.Length; i++)
        {
            var p = parameters[i];
            writeLine("      [" + i + "] " + FormatType(p.ParameterType) + " " + p.Name);
        }
    }

    public static string FormatType(Type type)
    {
        if (!type.IsGenericType)
        {
            return type.FullName ?? type.Name;
        }

        var def = type.GetGenericTypeDefinition();
        var args = type.GetGenericArguments();
        var sb = new StringBuilder();
        sb.Append(def.FullName?.Split('`')[0] ?? def.Name);
        sb.Append('<');
        for (var i = 0; i < args.Length; i++)
        {
            if (i > 0)
            {
                sb.Append(", ");
            }

            sb.Append(FormatType(args[i]));
        }

        sb.Append('>');
        return sb.ToString();
    }
}
