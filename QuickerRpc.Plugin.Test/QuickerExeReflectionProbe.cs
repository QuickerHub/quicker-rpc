using System;
using System.Reflection;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Test;

/// <summary>Reflection probe helpers; write human-readable lines for <c>dotnet test</c> console output.</summary>
internal static class QuickerExeReflectionProbe
{
    public static bool TryLoadQuickerExe(string exePath, Action<string> writeLine, out Assembly? assembly)
    {
        writeLine("Quicker.exe: " + exePath);
        if (!QuickerAssemblyReflection.TryLoadQuickerExe(exePath, out assembly))
        {
            writeLine("  (file not found)");
            return false;
        }

        writeLine("  Assembly: " + assembly!.FullName);
        writeLine("  Location: " + assembly.Location);
        return true;
    }

    public static void ScanTypeAndMethodByName(
        Assembly assembly,
        string typeFullName,
        string methodName,
        BindingFlags methodFlags,
        Action<string> writeLine)
    {
        writeLine("");
        writeLine("--- By name: " + typeFullName + "." + methodName + " ---");
        var type = QuickerAssemblyReflection.TryGetTypeByFullName(assembly, typeFullName);
        if (type is null)
        {
            writeLine("  Type not found.");
            return;
        }

        writeLine("  Type: " + type.FullName);
        var method = type.GetMethod(methodName, methodFlags);
        if (method is null)
        {
            writeLine("  Method not found with flags: " + methodFlags);
            return;
        }

        QuickerAssemblyReflection.WriteMethodDetail(method, writeLine);
    }

    public static void ScanAppStateStaticProperties(Assembly assembly, Action<string> writeLine)
    {
        writeLine("");
        writeLine("--- AppState static properties (ProfileStore, ActionEditMgr, …) ---");
        var appState = QuickerAssemblyReflection.TryGetAppStateType(assembly);
        if (appState is null)
        {
            writeLine("  AppState type not found.");
            return;
        }

        writeLine("  Type: " + appState.FullName);
        foreach (var name in new[] { "ProfileStore", "DataService", "ActionEditMgr", "AppServer" })
        {
            var prop = appState.GetProperty(name, QuickerAssemblyReflection.StaticFlags);
            writeLine("  Property " + name + ": " + (prop is null ? "(missing)" : prop.PropertyType.FullName));
        }
    }

    public static void ScanSaveEditingActionMethods(Assembly assembly, Action<string> writeLine)
    {
        writeLine("");
        writeLine("--- SaveEditingAction void(ActionItem) on ActionEditMgr ---");
        var matches = QuickerActionEditReflection.ScanSaveEditingActionMethods(assembly);
        writeLine("  Match count: " + matches.Count);
        foreach (var method in matches)
        {
            writeLine("");
            QuickerAssemblyReflection.WriteMethodDetail(method, writeLine);
        }

        var actionItem = QuickerActionEditReflection.TryFindSaveEditingActionOnActionEditMgrType(assembly);
        writeLine("");
        writeLine("  Plugin resolver: "
                    + (actionItem is null ? "(none or ambiguous)" : actionItem.DeclaringType!.FullName + "." + actionItem.Name));
    }

    public static BindingFlags StaticMethodFlags => QuickerAssemblyReflection.StaticFlags;

    public static BindingFlags InstanceMethodFlags => QuickerAssemblyReflection.InstanceFlags;
}
