using System;
using System.Collections.Generic;
using System.Reflection;
using Quicker.Common;

namespace QuickerRpc.Plugin.Reflection;

/// <summary>Offline probes for <c>ActionEditMgr.SaveEditingAction</c> (used by tests only).</summary>
internal static class QuickerActionEditReflection
{
    internal static MethodInfo? TryFindSaveEditingActionOnActionEditMgrType(Assembly quicker) =>
        TryFindSaveEditingActionOnActionEditMgrType(quicker, "ActionItem2")
        ?? TryFindSaveEditingActionOnActionEditMgrType(quicker, nameof(ActionItem));

    internal static MethodInfo? TryFindSaveEditingActionOnActionEditMgrType(
        Assembly quicker,
        string parameterTypeSimpleName)
    {
        if (!string.Equals(parameterTypeSimpleName, nameof(ActionItem), StringComparison.Ordinal)
            && !string.Equals(parameterTypeSimpleName, "ActionItem2", StringComparison.Ordinal))
        {
            return null;
        }

        var mgrType = QuickerAssemblyReflection.TryFindNamedType(quicker, "ActionEditMgr");
        if (mgrType is null)
        {
            return null;
        }

        MethodInfo? match = null;
        foreach (var candidate in mgrType.GetMethods(QuickerAssemblyReflection.InstanceFlags))
        {
            if (!IsSaveEditingActionSignature(candidate, parameterTypeSimpleName))
            {
                continue;
            }

            if (match is not null)
            {
                return null;
            }

            match = candidate;
        }

        return match;
    }

    internal static IReadOnlyList<MethodInfo> ScanSaveEditingActionMethods(Assembly quicker)
    {
        var matches = new List<MethodInfo>();
        foreach (var type in QuickerAssemblyReflection.EnumerateTypes(quicker))
        {
            if (!string.Equals(type.Name, "ActionEditMgr", StringComparison.Ordinal))
            {
                continue;
            }

            foreach (var method in type.GetMethods(QuickerAssemblyReflection.InstanceFlags))
            {
                if (IsSaveEditingActionSignature(method, parameterTypeSimpleName: null))
                {
                    matches.Add(method);
                }
            }
        }

        return matches;
    }

    internal static bool IsSaveEditingActionSignature(MethodInfo method, string? parameterTypeSimpleName)
    {
        if (method.IsStatic || method.ReturnType != typeof(void))
        {
            return false;
        }

        if (!string.Equals(method.Name, "SaveEditingAction", StringComparison.Ordinal))
        {
            return false;
        }

        var parameters = method.GetParameters();
        if (parameters.Length != 1)
        {
            return false;
        }

        var actualName = parameters[0].ParameterType.Name;
        if (!string.IsNullOrEmpty(parameterTypeSimpleName))
        {
            return string.Equals(actualName, parameterTypeSimpleName, StringComparison.Ordinal);
        }

        return string.Equals(actualName, nameof(ActionItem), StringComparison.Ordinal)
               || string.Equals(actualName, "ActionItem2", StringComparison.Ordinal);
    }
}
