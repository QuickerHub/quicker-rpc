using System;
using System.Linq;
using System.Reflection;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using Quicker.Common;
using Quicker.Domain;
using Quicker.Domain.Actions.X;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Read/write XAction via <c>AppState.ActionItem2Store</c> + <c>ActionEditorLauncher.SaveEditingAction(ActionItem2)</c> (reflection).
/// </summary>
internal static class ActionItem2ProgramAccess
{
    private const BindingFlags StaticFlags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static;
    private const BindingFlags InstanceFlags = BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance;

    private static readonly Lazy<object?> StoreInstance = new(ResolveStore);
    private static readonly Lazy<Type?> ActionItem2Type = new(ResolveActionItem2Type);
    private static readonly Lazy<Type?> XActionDtoType = new(ResolveXActionDtoType);
    private static readonly Lazy<string?> XActionOperationType = new(ResolveXActionOperationTypeConstant);

    private static readonly JsonSerializerSettings BodyJson = new()
    {
        ContractResolver = new CamelCasePropertyNamesContractResolver(),
        NullValueHandling = NullValueHandling.Ignore,
        MissingMemberHandling = MissingMemberHandling.Ignore,
    };

    public static bool IsAvailable => StoreInstance.Value is not null && ActionItem2Type.Value is not null;

    public static bool TryGetById(string actionId, out object? action, out string? error)
    {
        action = null;
        error = null;
        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            error = "actionId is required.";
            return false;
        }

        if (!IsAvailable)
        {
            error = "ActionItem2Store unavailable.";
            return false;
        }

        try
        {
            var getById = StoreInstance.Value!.GetType().GetMethod(
                "GetActionById",
                InstanceFlags,
                binder: null,
                types: new[] { typeof(string) },
                modifiers: null);
            if (getById is null)
            {
                error = "ActionItem2Store.GetActionById unavailable.";
                return false;
            }

            var tuple = getById.Invoke(StoreInstance.Value, new object[] { id });
            action = ReadTupleField(tuple, "Item1", "action");
            if (action is null || IsEmptyGuid(action))
            {
                error = $"Action not found: {id}";
                return false;
            }

            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    public static bool IsXAction(object action) => TryGetXActionPayloadJson(action) is not null;

    public static string? TryGetXActionPayloadJson(object action)
    {
        var payload = action.GetType().GetProperty("OperationPayload", InstanceFlags)?.GetValue(action);
        if (payload is null)
        {
            return action is ActionItem legacy && legacy.ActionType == ActionType.XAction ? legacy.Data : null;
        }

        var dtoType = XActionDtoType.Value;
        if (dtoType is not null && dtoType.IsInstanceOfType(payload))
        {
            return JsonConvert.SerializeObject(payload, BodyJson);
        }

        var legacyCompat = payload.GetType().GetProperty("Data", InstanceFlags)?.GetValue(payload) as string;
        return legacyCompat;
    }

    public static long GetEditVersionMs(object action)
    {
        var metadata = action.GetType().GetProperty("Metadata", InstanceFlags)?.GetValue(action);
        var dt = metadata?.GetType().GetProperty("LastEditTimeUtc", InstanceFlags)?.GetValue(metadata) as DateTime?;
        return ToUnixMilliseconds(dt);
    }

    public static bool TrySaveXAction(string actionId, XAction xAction, out string? error)
    {
        error = null;
        if (!TryGetById(actionId, out var source, out error) || source is null)
        {
            return false;
        }

        if (TryGetXActionPayloadJson(source) is null)
        {
            error = $"Action {actionId} is not an XAction program.";
            return false;
        }

        try
        {
            var result = CloneActionItem2(source);
            ApplyXActionPayload(result, xAction);
            SetLastEditTimeUtc(result, DateTime.UtcNow);

            var mgr = ActionEditMgrAccessor.TryCreate();
            if (mgr is not null && mgr.TrySaveEditingAction(result, out error))
            {
                return true;
            }

            if (TryInvokeLauncherSaveEditingAction(result, out error))
            {
                return true;
            }

            error ??= "SaveEditingAction(ActionItem2) unavailable.";
            return false;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    public static ActionItem? ToLegacyRuntimeAction(object action2)
    {
        var extType = typeof(AppState).Assembly.GetType("Quicker.Utilities.Extensions.ActionItem2Extensions", false);
        if (extType is null)
        {
            return null;
        }

        var method = extType.GetMethod("ToLegacyRuntimeAction", InstanceFlags, null, new[] { ActionItem2Type.Value! }, null);
        if (method is null)
        {
            return null;
        }

        return method.Invoke(null, new[] { action2 }) as ActionItem;
    }

    private static object CloneActionItem2(object action) =>
        JsonConvert.DeserializeObject(JsonConvert.SerializeObject(action), action.GetType())!;

    private static void ApplyXActionPayload(object target, XAction x)
    {
        var opType = XActionOperationType.Value ?? "xaction";
        target.GetType().GetProperty("OperationType", InstanceFlags)?.SetValue(target, opType);

        var dtoType = XActionDtoType.Value
            ?? throw new InvalidOperationException("XActionDto type unavailable.");
        var dto = JsonConvert.DeserializeObject(JsonConvert.SerializeObject(x, BodyJson), dtoType)
            ?? throw new InvalidOperationException("Failed to map XAction to XActionDto.");
        target.GetType().GetProperty("OperationPayload", InstanceFlags)?.SetValue(target, dto);
    }

    private static void SetLastEditTimeUtc(object action, DateTime utc)
    {
        var metadataProp = action.GetType().GetProperty("Metadata", InstanceFlags);
        var metadata = metadataProp?.GetValue(action);
        if (metadata is null)
        {
            var metadataType = typeof(AppState).Assembly.GetType("Quicker.Common.V2.ActionMetadata", false)
                ?? metadataProp?.PropertyType;
            if (metadataType is not null)
            {
                metadata = Activator.CreateInstance(metadataType);
                metadataProp?.SetValue(action, metadata);
            }
        }

        metadata?.GetType().GetProperty("LastEditTimeUtc", InstanceFlags)?.SetValue(metadata, utc);
    }

    private static bool TryInvokeLauncherSaveEditingAction(object resultAction, out string? error)
    {
        error = null;
        try
        {
            var launcherType = typeof(AppState).Assembly.GetType("Quicker.Domain.Services.ActionEditorLauncher", false);
            if (launcherType is null)
            {
                error = "ActionEditorLauncher unavailable.";
                return false;
            }

            var getService = typeof(AppState).GetMethods(StaticFlags)
                .FirstOrDefault(m => m.Name == "GetService" && m.IsGenericMethodDefinition && m.GetParameters().Length == 0);
            if (getService is null)
            {
                error = "AppState.GetService unavailable.";
                return false;
            }

            var launcher = getService.MakeGenericMethod(launcherType).Invoke(null, null);
            if (launcher is null)
            {
                error = "ActionEditorLauncher instance unavailable.";
                return false;
            }

            var save = launcher.GetType().GetMethods(InstanceFlags)
                .FirstOrDefault(m =>
                    string.Equals(m.Name, "SaveEditingAction", StringComparison.Ordinal)
                    && m.GetParameters().Length == 1
                    && m.GetParameters()[0].ParameterType.IsInstanceOfType(resultAction));
            if (save is null)
            {
                error = "SaveEditingAction(ActionItem2) unavailable.";
                return false;
            }

            save.Invoke(launcher, new[] { resultAction });
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

    private static object? ResolveStore()
    {
        var direct = typeof(AppState).GetProperty("ActionItem2Store", StaticFlags)?.GetValue(null);
        if (direct is not null)
        {
            return direct;
        }

        var storeType = FindType("ActionItem2Store");
        if (storeType is null)
        {
            return null;
        }

        return ResolveAppStateService(storeType);
    }

    private static Type? ResolveActionItem2Type() =>
        FindType("ActionItem2")
        ?? typeof(AppState).Assembly.GetType("Quicker.Common.V2.ActionItem2", false)
        ?? typeof(ActionItem).Assembly.GetType("Quicker.Common.V2.ActionItem2", false);

    private static Type? FindType(string simpleName)
    {
        foreach (var assembly in new[] { typeof(AppState).Assembly, typeof(ActionItem).Assembly })
        {
            var t = assembly.GetType("Quicker.Common.V2." + simpleName, false)
                ?? assembly.GetType("Quicker.Domain.Services." + simpleName, false);
            if (t is not null)
            {
                return t;
            }

            try
            {
                foreach (var candidate in assembly.GetTypes())
                {
                    if (string.Equals(candidate.Name, simpleName, StringComparison.Ordinal))
                    {
                        return candidate;
                    }
                }
            }
            catch
            {
                // dynamic assemblies may throw
            }
        }

        return null;
    }

    private static object? ResolveAppStateService(Type serviceType)
    {
        try
        {
            var getService = typeof(AppState).GetMethods(StaticFlags)
                .FirstOrDefault(m =>
                    string.Equals(m.Name, "GetService", StringComparison.Ordinal)
                    && m.IsGenericMethodDefinition
                    && m.GetParameters().Length == 0);
            if (getService is not null)
            {
                return getService.MakeGenericMethod(serviceType).Invoke(null, null);
            }
        }
        catch
        {
            // fall through
        }

        return null;
    }

    private static Type? ResolveXActionDtoType() =>
        typeof(AppState).Assembly.GetType("Quicker.Common.ActionPayloads.XAction.XActionDto", false)
        ?? typeof(ActionItem).Assembly.GetType("Quicker.Common.ActionPayloads.XAction.XActionDto", false);

    private static string? ResolveXActionOperationTypeConstant()
    {
        var opTypes = typeof(AppState).Assembly.GetType("Quicker.Common.V2.OperationTypes", false)
            ?? typeof(ActionItem).Assembly.GetType("Quicker.Common.V2.OperationTypes", false);
        return opTypes?.GetField("XACTION", StaticFlags)?.GetValue(null) as string;
    }

    private static bool IsEmptyGuid(object action)
    {
        var idValue = action.GetType().GetProperty("Id", InstanceFlags)?.GetValue(action);
        return idValue switch
        {
            Guid g => g == Guid.Empty,
            string s => !Guid.TryParse(s, out var parsed) || parsed == Guid.Empty,
            _ => true,
        };
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

    private static long ToUnixMilliseconds(DateTime? dt)
    {
        if (!dt.HasValue)
        {
            return 0;
        }

        var v = dt.Value;
        var utc = v.Kind switch
        {
            DateTimeKind.Utc => v,
            DateTimeKind.Local => v.ToUniversalTime(),
            _ => DateTime.SpecifyKind(v, DateTimeKind.Utc),
        };

        return new DateTimeOffset(utc, TimeSpan.Zero).ToUnixTimeMilliseconds();
    }
}
