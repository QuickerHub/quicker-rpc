using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using Quicker.Common;
using Quicker.Domain;
using Quicker.Utilities;

namespace QuickerRpc.Plugin.Reflection;

/// <summary>
/// Centralized access to Quicker internals. Uses direct API where the plugin reference allows it;
/// otherwise resolves once and caches delegates (ProfileStore, ActionEditMgr, …).
/// </summary>
internal static class QuickerInternalAccess
{
    private const BindingFlags StaticFlags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static;
    private const BindingFlags InstanceFlags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;

    private static readonly Lazy<object?> CatalogStore = new(ResolveCatalogStore);
    private static readonly Lazy<object?> ActionEditMgrInstance = new(ResolveActionEditMgr);
    private static readonly Lazy<Action<object>?> SaveEditingActionItem2Delegate =
        new(CreateSaveEditingActionItem2Delegate);
    private static readonly Lazy<Action<ActionItem>?> SaveEditingActionLegacyDelegate =
        new(CreateSaveEditingActionLegacyDelegate);
    private static readonly Lazy<Func<ActionItem, object>?> ActionItem2ConverterDelegate =
        new(CreateActionItem2ConverterDelegate);
    private static readonly Lazy<Func<string, ActionItem?>?> GetActionByIdDelegate = new(CreateGetActionByIdDelegate);
    private static readonly Lazy<Func<IEnumerable<ActionItem>>?> GetAllActionItemsDelegate = new(CreateGetAllActionItemsDelegate);

    public static bool IsInQuicker =>
        string.Equals(Assembly.GetEntryAssembly()?.GetName().Name, "Quicker", StringComparison.Ordinal);

    public static bool IsCatalogAvailable => CatalogStore.Value is not null;

    public static bool TryGetActionById(string actionId, out ActionItem? action)
    {
        action = null;
        if (!IsInQuicker || string.IsNullOrWhiteSpace(actionId))
        {
            return false;
        }

        var getById = GetActionByIdDelegate.Value;
        if (getById is null)
        {
            return false;
        }

        action = getById(actionId.Trim());
        return action is not null;
    }

    public static IEnumerable<ActionItem> EnumerateAllActionItems()
    {
        if (!IsInQuicker)
        {
            yield break;
        }

        var getAll = GetAllActionItemsDelegate.Value;
        if (getAll is null)
        {
            yield break;
        }

        foreach (var item in getAll())
        {
            if (item is not null)
            {
                yield return item;
            }
        }
    }

    public static bool TrySaveEditingAction(ActionItem action, out string? error)
    {
        error = null;
        if (action is null)
        {
            error = "ActionItem is required.";
            return false;
        }

        var now = AppHelper.GetUtcNowForDb();
        action.LastEditTimeUtc = now;

        var convert = ActionItem2ConverterDelegate.Value;
        var saveItem2 = SaveEditingActionItem2Delegate.Value;
        if (convert is not null && saveItem2 is not null)
        {
            try
            {
                var action2 = convert(action);
                TouchActionItem2LastEditTimeUtc(action2, now);
                saveItem2(action2);
                return true;
            }
            catch (TargetInvocationException ex)
            {
                error = ex.InnerException?.Message ?? ex.Message;
                return false;
            }
            catch (Exception ex)
            {
                error = ex.Message;
                return false;
            }
        }

        var saveLegacy = SaveEditingActionLegacyDelegate.Value;
        if (saveLegacy is null)
        {
            error = "SaveEditingAction unavailable.";
            return false;
        }

        try
        {
            saveLegacy(action);
            return true;
        }
        catch (TargetInvocationException ex)
        {
            error = ex.InnerException?.Message ?? ex.Message;
            return false;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    public static object? TryGetActionEditMgr() => ActionEditMgrInstance.Value;

    public static object? TryGetService(Type serviceType)
    {
        if (serviceType is null || !IsInQuicker)
        {
            return null;
        }

        try
        {
            var generic = typeof(AppState).GetMethods(StaticFlags)
                .FirstOrDefault(m =>
                    string.Equals(m.Name, "GetService", StringComparison.Ordinal)
                    && m.IsGenericMethodDefinition
                    && m.GetParameters().Length == 0);
            if (generic is not null)
            {
                return generic.MakeGenericMethod(serviceType).Invoke(null, null);
            }
        }
        catch
        {
            // fall through
        }

        try
        {
            var nonGeneric = typeof(AppState).GetMethod(
                "GetService",
                StaticFlags,
                binder: null,
                types: new[] { typeof(Type) },
                modifiers: null);
            return nonGeneric?.Invoke(null, new object[] { serviceType });
        }
        catch
        {
            return null;
        }
    }

    public static object? TryGetAppStateStaticProperty(string propertyName) =>
        IsInQuicker ? typeof(AppState).GetProperty(propertyName, StaticFlags)?.GetValue(null) : null;

    private static object? ResolveCatalogStore()
    {
        if (!IsInQuicker)
        {
            return null;
        }

        return TryGetAppStateStaticProperty("ProfileStore")
            ?? TryGetAppStateStaticProperty("DataService");
    }

    private static object? ResolveActionEditMgr()
    {
        if (!IsInQuicker)
        {
            return null;
        }

        var viaProperty = TryGetAppStateStaticProperty("ActionEditMgr");
        if (viaProperty is not null)
        {
            return viaProperty;
        }

        var mgrType = typeof(AppState).Assembly.GetType("Quicker.Domain.Services.ActionEditMgr", throwOnError: false)
            ?? typeof(AppState).Assembly.GetTypes().FirstOrDefault(t => string.Equals(t.Name, "ActionEditMgr", StringComparison.Ordinal));
        if (mgrType is null)
        {
            return null;
        }

        return TryGetService(mgrType)
            ?? typeof(AppState).GetMethods(StaticFlags)
                .FirstOrDefault(m => m.GetParameters().Length == 0 && m.ReturnType == mgrType)
                ?.Invoke(null, null);
    }

    private static Func<string, ActionItem?>? CreateGetActionByIdDelegate()
    {
        var store = CatalogStore.Value;
        if (store is null)
        {
            return null;
        }

        var getById = store.GetType().GetMethod(
            "GetActionById",
            InstanceFlags,
            binder: null,
            types: new[] { typeof(string) },
            modifiers: null);
        if (getById is null)
        {
            return null;
        }

        return id =>
        {
            var raw = getById.Invoke(store, new object[] { id });
            if (raw is ActionItem direct)
            {
                return direct;
            }

            return ReadTupleField(raw, "Item1", "action") as ActionItem;
        };
    }

    private static Func<IEnumerable<ActionItem>>? CreateGetAllActionItemsDelegate()
    {
        var store = CatalogStore.Value;
        if (store is null)
        {
            return null;
        }

        var getAll = store.GetType().GetMethod(
            "GetAllActionItems",
            InstanceFlags,
            binder: null,
            types: Type.EmptyTypes,
            modifiers: null);
        if (getAll is null)
        {
            return null;
        }

        return () =>
        {
            if (getAll.Invoke(store, null) is not IEnumerable items)
            {
                return Array.Empty<ActionItem>();
            }

            var list = new List<ActionItem>();
            foreach (var item in items)
            {
                if (item is ActionItem ai)
                {
                    list.Add(ai);
                }
            }

            return list;
        };
    }

    private static Action<object>? CreateSaveEditingActionItem2Delegate()
    {
        var mgr = ActionEditMgrInstance.Value;
        if (mgr is null)
        {
            return null;
        }

        var save = FindSaveEditingActionMethod(mgr, "ActionItem2");
        if (save is null)
        {
            return null;
        }

        return action2 => save.Invoke(mgr, new object[] { action2 });
    }

    private static Func<ActionItem, object>? CreateActionItem2ConverterDelegate()
    {
        var converterType = typeof(ActionItem).Assembly.GetType("Quicker.Common.V2.ActionItem2Converter", throwOnError: false);
        if (converterType is null)
        {
            return null;
        }

        var convert = converterType.GetMethod(
            "Convert",
            StaticFlags,
            binder: null,
            types: new[] { typeof(ActionItem) },
            modifiers: null);
        if (convert is null)
        {
            return null;
        }

        return source =>
        {
            var converted = convert.Invoke(null, new object[] { source });
            if (converted is null)
            {
                throw new InvalidOperationException("ActionItem2Converter.Convert returned null.");
            }

            return converted;
        };
    }

    private static void TouchActionItem2LastEditTimeUtc(object action2, DateTime lastEditUtc)
    {
        var metadataProperty = action2.GetType().GetProperty("Metadata", InstanceFlags);
        if (metadataProperty is null)
        {
            return;
        }

        var metadata = metadataProperty.GetValue(action2);
        if (metadata is null)
        {
            var metadataType = metadataProperty.PropertyType;
            metadata = Activator.CreateInstance(metadataType!);
            metadataProperty.SetValue(action2, metadata);
        }

        metadata!.GetType().GetProperty("LastEditTimeUtc", InstanceFlags)?.SetValue(metadata, lastEditUtc);
    }

    private static Action<ActionItem>? CreateSaveEditingActionLegacyDelegate()
    {
        var mgr = ActionEditMgrInstance.Value;
        if (mgr is null)
        {
            return null;
        }

        var save = FindSaveEditingActionMethod(mgr, nameof(ActionItem));
        if (save is null)
        {
            return null;
        }

        return action => save.Invoke(mgr, new object[] { action });
    }

    private static MethodInfo? FindSaveEditingActionMethod(object mgr, string parameterTypeSimpleName)
    {
        MethodInfo? match = null;
        foreach (var candidate in mgr.GetType().GetMethods(InstanceFlags))
        {
            if (!string.Equals(candidate.Name, "SaveEditingAction", StringComparison.Ordinal)
                || candidate.ReturnType != typeof(void))
            {
                continue;
            }

            var parameters = candidate.GetParameters();
            if (parameters.Length != 1
                || !string.Equals(parameters[0].ParameterType.Name, parameterTypeSimpleName, StringComparison.Ordinal))
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
