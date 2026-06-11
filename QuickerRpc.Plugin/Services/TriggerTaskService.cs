using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using Quicker.Common.Entities;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// CRUD over Quicker event trigger tasks (<c>UserSettings.TriggerTasks</c>).
/// Persisting via <see cref="QuickerSettingsAccessor.TrySaveUserSettings"/> also raises
/// <c>UserSettingsChangedMessage</c>, which makes Quicker's TriggerManageService reload all watchers.
/// </summary>
public sealed class TriggerTaskService
{
    public QuickerRpcTriggerListResult List(string? query, string? eventType)
    {
        if (!TryGetTasks(createIfMissing: false, out _, out var tasks, out var error))
        {
            return new QuickerRpcTriggerListResult { Ok = false, Message = error };
        }

        var all = tasks ?? (IList<CommonTriggerTask>)Array.Empty<CommonTriggerTask>();
        var descriptions = TryGetEventDescriptions();
        var q = (query ?? string.Empty).Trim();
        var et = (eventType ?? string.Empty).Trim();

        var items = all
            .Where(t => t is not null)
            .Where(t => et.Length == 0 || string.Equals(t.EventType, et, StringComparison.Ordinal))
            .Where(t => q.Length == 0 || MatchesQuery(t, q))
            .Select(t => ToInfo(t, descriptions))
            .ToList();

        return new QuickerRpcTriggerListResult
        {
            Ok = true,
            TotalCount = all.Count(t => t is not null),
            Items = items,
        };
    }

    public QuickerRpcTriggerEventTypesResult ListEventTypes(string? eventType)
    {
        var (items, source) = TriggerEventCatalog.GetEventTypes();
        var et = (eventType ?? string.Empty).Trim();
        var filtered = et.Length == 0
            ? items.ToList()
            : items.Where(i => string.Equals(i.EventType, et, StringComparison.OrdinalIgnoreCase)).ToList();

        return new QuickerRpcTriggerEventTypesResult
        {
            Ok = true,
            Source = source,
            Message = source == TriggerEventCatalog.SourceStatic
                ? "Live trigger services unavailable; using embedded catalog (field metadata may be incomplete)."
                : null,
            Items = filtered,
        };
    }

    public QuickerRpcTriggerSaveResult Save(QuickerRpcTriggerTaskInfo input)
    {
        if (input is null)
        {
            return FailSave("Trigger task payload is required.");
        }

        if (!TryGetTasks(createIfMissing: true, out var settings, out var tasks, out var error) || tasks is null || settings is null)
        {
            return FailSave(error ?? "TriggerTasks unavailable.");
        }

        var warnings = new List<string>();
        CommonTriggerTask? task = null;
        var created = false;

        var id = (input.Id ?? string.Empty).Trim();
        if (id.Length > 0)
        {
            if (!Guid.TryParse(id, out var guid))
            {
                return FailSave($"Invalid trigger id '{id}' (expected a Guid).");
            }

            task = tasks.FirstOrDefault(t => t is not null && t.Id == guid);
            if (task is null)
            {
                return FailSave($"Trigger task '{id}' not found.");
            }
        }
        else
        {
            if (string.IsNullOrWhiteSpace(input.EventType))
            {
                return FailSave("eventType is required when creating a trigger task.");
            }

            if (string.IsNullOrWhiteSpace(input.ActionIdOrName))
            {
                return FailSave("action (id or name) is required when creating a trigger task.");
            }

            task = new CommonTriggerTask { IsEnabled = true };
            created = true;
        }

        if (input.EventType is not null)
        {
            var et = input.EventType.Trim();
            if (et.Length == 0)
            {
                return FailSave("eventType must not be empty.");
            }

            var known = TriggerEventCatalog.GetKnownEventTypes();
            if (known.Count > 0 && !known.Contains(et))
            {
                warnings.Add($"Unknown eventType '{et}' (case sensitive). See 'qkrpc trigger events' for supported types.");
            }

            task.EventType = et;
        }

        if (input.ParamsJson is not null)
        {
            if (!TryParseParams(input.ParamsJson, out var parsedParams, out var paramsError))
            {
                return FailSave(paramsError ?? "Invalid params JSON.");
            }

            task.Params = parsedParams;
        }

        if (input.ActionIdOrName is not null)
        {
            task.ActionIdOrName = input.ActionIdOrName.Trim();
        }

        if (input.Note is not null)
        {
            task.Note = input.Note;
        }

        if (input.IsEnabled.HasValue)
        {
            task.IsEnabled = input.IsEnabled.Value;
        }

        if (input.ActionParam is not null)
        {
            task.ActionParam = input.ActionParam;
        }

        if (input.DebounceMs.HasValue)
        {
            task.DebounceMs = input.DebounceMs.Value;
        }

        if (input.ThrottleMs.HasValue)
        {
            task.ThrottleMs = input.ThrottleMs.Value;
        }

        if (input.DelayMs.HasValue)
        {
            task.DelayMs = input.DelayMs.Value;
        }

        if (input.SkipFurtherTasks.HasValue)
        {
            task.SkipFurtherTasks = input.SkipFurtherTasks.Value;
        }

        if (input.EventFilterExpression is not null)
        {
            task.EventFilterExpression = input.EventFilterExpression;
        }

        if (input.ValidForMachines is not null)
        {
            task.ValidForMachines = input.ValidForMachines;
        }

        task.LastEditTimeUtc = DateTime.UtcNow;

        ValidateAction(task, warnings);

        if (created)
        {
            tasks.Add(task);
            WarnIfOverFreeLimit(tasks.Count, warnings);
        }

        if (!QuickerSettingsAccessor.TrySaveUserSettings(settings, out var saveError))
        {
            if (created)
            {
                tasks.Remove(task);
            }

            return FailSave(saveError ?? "Failed to persist user settings.");
        }

        return new QuickerRpcTriggerSaveResult
        {
            Ok = true,
            Created = created,
            Task = ToInfo(task, TryGetEventDescriptions()),
            Warnings = warnings,
        };
    }

    public QuickerRpcTriggerDeleteResult Delete(string id)
    {
        var trimmed = (id ?? string.Empty).Trim();
        if (!Guid.TryParse(trimmed, out var guid))
        {
            return new QuickerRpcTriggerDeleteResult { Ok = false, Id = trimmed, Message = "Invalid trigger id (expected a Guid)." };
        }

        if (!TryGetTasks(createIfMissing: false, out var settings, out var tasks, out var error) || settings is null)
        {
            return new QuickerRpcTriggerDeleteResult { Ok = false, Id = trimmed, Message = error };
        }

        var task = tasks?.FirstOrDefault(t => t is not null && t.Id == guid);
        if (task is null || tasks is null)
        {
            return new QuickerRpcTriggerDeleteResult { Ok = false, Id = trimmed, Message = $"Trigger task '{trimmed}' not found." };
        }

        tasks.Remove(task);

        if (!QuickerSettingsAccessor.TrySaveUserSettings(settings, out var saveError))
        {
            tasks.Add(task);
            return new QuickerRpcTriggerDeleteResult { Ok = false, Id = trimmed, Message = saveError };
        }

        return new QuickerRpcTriggerDeleteResult { Ok = true, Id = trimmed };
    }

    public QuickerRpcTriggerSaveResult SetEnabled(string id, bool enabled) =>
        Save(new QuickerRpcTriggerTaskInfo { Id = id, IsEnabled = enabled });

    private static bool MatchesQuery(CommonTriggerTask task, string query) =>
        Contains(task.Note, query)
        || Contains(task.EventType, query)
        || Contains(task.ActionIdOrName, query)
        || Contains(task.Id.ToString(), query);

    private static bool Contains(string? value, string query) =>
        value is not null && value.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0;

    private static QuickerRpcTriggerTaskInfo ToInfo(
        CommonTriggerTask task,
        IReadOnlyDictionary<string, string?>? eventDescriptions)
    {
        string? eventDescription = null;
        if (task.EventType is not null)
        {
            eventDescriptions?.TryGetValue(task.EventType, out eventDescription);
        }

        return new QuickerRpcTriggerTaskInfo
        {
            Id = task.Id.ToString(),
            Note = task.Note,
            IsEnabled = task.IsEnabled,
            EventType = task.EventType,
            EventDescription = eventDescription,
            ParamsJson = SerializeParams(task.Params),
            ActionIdOrName = task.ActionIdOrName,
            ActionTitle = TryResolveActionTitle(task.ActionIdOrName),
            ActionParam = task.ActionParam,
            DebounceMs = task.DebounceMs,
            ThrottleMs = task.ThrottleMs,
            DelayMs = task.DelayMs,
            SkipFurtherTasks = task.SkipFurtherTasks,
            EventFilterExpression = task.EventFilterExpression,
            ValidForMachines = task.ValidForMachines,
            LastEditTimeUtc = task.LastEditTimeUtc,
        };
    }

    private static IReadOnlyDictionary<string, string?>? TryGetEventDescriptions()
    {
        try
        {
            var (items, _) = TriggerEventCatalog.GetEventTypes();
            var map = new Dictionary<string, string?>(StringComparer.Ordinal);
            foreach (var item in items)
            {
                map[item.EventType] = item.Description;
            }

            return map;
        }
        catch
        {
            return null;
        }
    }

    private static string? TryResolveActionTitle(string? actionIdOrName)
    {
        if (string.IsNullOrWhiteSpace(actionIdOrName) || !Guid.TryParse(actionIdOrName.Trim(), out _))
        {
            return null;
        }

        try
        {
            return QuickerInternalAccess.TryGetActionById(actionIdOrName.Trim(), out var action)
                ? action?.Title
                : null;
        }
        catch
        {
            return null;
        }
    }

    private static void ValidateAction(CommonTriggerTask task, ICollection<string> warnings)
    {
        var actionRef = (task.ActionIdOrName ?? string.Empty).Trim();
        if (actionRef.Length == 0)
        {
            warnings.Add("Trigger has no action; Quicker will ignore it until an action is assigned.");
            return;
        }

        if (Guid.TryParse(actionRef, out _)
            && (!QuickerInternalAccess.TryGetActionById(actionRef, out var action) || action is null))
        {
            warnings.Add($"Action '{actionRef}' was not found in the local action catalog (it may be a title or not installed yet).");
        }
    }

    private static void WarnIfOverFreeLimit(int taskCount, ICollection<string> warnings)
    {
        if (taskCount <= 2)
        {
            return;
        }

        try
        {
            var dataService = QuickerInternalAccess.TryGetAppStateStaticProperty("DataService");
            var isPro = dataService?.GetType()
                .GetProperty("IsProNow", QuickerAssemblyReflection.InstanceFlags)
                ?.GetValue(dataService);
            if (isPro is false)
            {
                warnings.Add("Quicker free edition supports at most 2 event trigger rules in the UI; extra rules may not be honored.");
            }
        }
        catch
        {
            // pro check is best effort
        }
    }

    private static bool TryGetTasks(
        bool createIfMissing,
        out object? settings,
        out IList<CommonTriggerTask>? tasks,
        out string? error)
    {
        tasks = null;

        if (!QuickerSettingsAccessor.TryGetUserSettings(out settings, out error) || settings is null)
        {
            error ??= "UserSettings unavailable.";
            return false;
        }

        var property = settings.GetType().GetProperty("TriggerTasks", QuickerAssemblyReflection.InstanceFlags);
        if (property is null)
        {
            error = "UserSettings.TriggerTasks property unavailable.";
            return false;
        }

        var value = property.GetValue(settings);
        if (value is IList<CommonTriggerTask> typed)
        {
            tasks = typed;
            return true;
        }

        if (value is null)
        {
            if (!createIfMissing)
            {
                tasks = null;
                return true;
            }

            var list = new List<CommonTriggerTask>();
            try
            {
                property.SetValue(settings, list);
            }
            catch (Exception ex)
            {
                error = "Failed to initialize TriggerTasks: " + ex.Message;
                return false;
            }

            tasks = list;
            return true;
        }

        error = "UserSettings.TriggerTasks has unexpected type " + value.GetType().FullName + ".";
        return false;
    }

    private static bool TryParseParams(
        string paramsJson,
        out IDictionary<string, object>? result,
        out string? error)
    {
        result = null;
        error = null;

        var trimmed = paramsJson.Trim();
        if (trimmed.Length == 0)
        {
            return true;
        }

        JsonDocument document;
        try
        {
            document = JsonDocument.Parse(trimmed);
        }
        catch (JsonException ex)
        {
            error = "params must be a JSON object: " + ex.Message;
            return false;
        }

        using (document)
        {
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                error = "params must be a JSON object (e.g. {\"ProcessName\":\"notepad\"}).";
                return false;
            }

            var map = new Dictionary<string, object>(StringComparer.Ordinal);
            foreach (var prop in document.RootElement.EnumerateObject())
            {
                var value = ToPlainValue(prop.Value);
                if (value is not null)
                {
                    map[prop.Name] = value;
                }
            }

            result = map;
            return true;
        }
    }

    private static object? ToPlainValue(JsonElement element) => element.ValueKind switch
    {
        JsonValueKind.String => element.GetString(),
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.Number => element.TryGetInt64(out var l) ? l : element.GetDouble(),
        JsonValueKind.Object => element.EnumerateObject()
            .Aggregate(new Dictionary<string, object>(StringComparer.Ordinal), (acc, p) =>
            {
                var v = ToPlainValue(p.Value);
                if (v is not null)
                {
                    acc[p.Name] = v;
                }

                return acc;
            }),
        JsonValueKind.Array => element.EnumerateArray().Select(ToPlainValue).Where(v => v is not null).ToList(),
        _ => null,
    };

    private static string? SerializeParams(IDictionary<string, object>? parameters)
    {
        if (parameters is null || parameters.Count == 0)
        {
            return null;
        }

        try
        {
            var plain = new Dictionary<string, object?>(StringComparer.Ordinal);
            foreach (var pair in parameters)
            {
                plain[pair.Key] = TriggerEventCatalog.NormalizeValue(pair.Value);
            }

            return JsonSerializer.Serialize(plain);
        }
        catch
        {
            return null;
        }
    }

    private static QuickerRpcTriggerSaveResult FailSave(string message) =>
        new() { Ok = false, Message = message };
}
