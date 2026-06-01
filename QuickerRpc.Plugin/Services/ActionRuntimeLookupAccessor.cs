using System;
using System.Linq;
using System.Reflection;
using Quicker.Common;
using Quicker.Domain;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Resolves actions via Quicker <c>ActionRuntimeLookupService</c> (type name stable; service via DI).
/// </summary>
internal static class ActionRuntimeLookupAccessor
{
    private const BindingFlags InstanceFlags = BindingFlags.Public | BindingFlags.Instance;

    private static readonly Lazy<Binding?> Lookup = new(ResolveBinding);

    public static bool TryGetActionItem(
        string actionId,
        bool useSourceId,
        out ActionItem? action,
        out string? errorMessage)
    {
        action = null;
        errorMessage = null;
        var binding = Lookup.Value;
        if (binding is null)
        {
            return false;
        }

        try
        {
            var raw = binding.GetWithLocation(binding.Instance, actionId.Trim(), useSourceId);
            if (raw is null)
            {
                errorMessage = $"Action not found: {actionId}";
                return false;
            }

            action = ReadTupleField(raw, "Item1", "action") as ActionItem;
            if (action is null)
            {
                errorMessage = $"Action not found: {actionId}";
                return false;
            }

            return true;
        }
        catch (Exception ex)
        {
            errorMessage = ex.Message;
            return false;
        }
    }

    private sealed class Binding
    {
        public Binding(object instance, Func<object, string, bool, object?> getWithLocation)
        {
            Instance = instance;
            GetWithLocation = getWithLocation;
        }

        public object Instance { get; }

        public Func<object, string, bool, object?> GetWithLocation { get; }
    }

    private static Binding? ResolveBinding()
    {
        var lookupType = typeof(AppState).Assembly.GetType(
                "Quicker.Modules.ActionExecution.Services.ActionRuntimeLookupService",
                throwOnError: false)
            ?? typeof(AppState).Assembly.GetType(
                "Quicker.Domain.Services.ActionRuntimeLookupService",
                throwOnError: false);
        if (lookupType is null)
        {
            return null;
        }

        var instance = QuickerInternalAccess.TryGetService(lookupType);
        if (instance is null)
        {
            return null;
        }

        var getWithLocation = lookupType.GetMethods(InstanceFlags)
            .FirstOrDefault(m =>
                string.Equals(m.Name, "GetActionWithLocationByIdOrNameOrSourceId", StringComparison.Ordinal)
                && m.GetParameters().Length == 2
                && m.GetParameters()[0].ParameterType == typeof(string));
        if (getWithLocation is null)
        {
            return null;
        }

        return new Binding(
            instance,
            (svc, id, useSourceId) => getWithLocation.Invoke(svc, new object[] { id, useSourceId }));
    }

    private static object? ReadTupleField(object? tuple, string itemName, string? namedField)
    {
        if (tuple is null)
        {
            return null;
        }

        var valueType = tuple.GetType();
        if (namedField is not null)
        {
            var named = valueType.GetField(namedField)?.GetValue(tuple)
                ?? valueType.GetProperty(namedField)?.GetValue(tuple);
            if (named is not null)
            {
                return named;
            }
        }

        return valueType.GetField(itemName)?.GetValue(tuple)
            ?? valueType.GetProperty(itemName)?.GetValue(tuple);
    }
}
