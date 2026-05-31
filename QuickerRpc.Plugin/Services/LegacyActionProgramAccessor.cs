using System;
using System.Collections.Generic;
using System.Reflection;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Quicker.Common;
using Quicker.Domain;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Read/write XAction programs via legacy <see cref="ActionItem"/> and <see cref="AppState.DataService"/>.
/// </summary>
internal sealed class LegacyActionProgramAccessor
{
    private LegacyActionProgramAccessor()
    {
    }

    public bool IsAvailable => QuickerHost.IsRunningInQuicker();

    public static LegacyActionProgramAccessor? TryCreate()
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return null;
        }

        try
        {
            _ = AppState.DataService;
            return new LegacyActionProgramAccessor();
        }
        catch
        {
            return null;
        }
    }

    public bool TryGetById(string actionId, out ActionItem? action, out string? error)
    {
        action = null;
        error = null;
        if (!IsAvailable)
        {
            error = "DataService unavailable.";
            return false;
        }

        try
        {
            var (item, _) = AppState.DataService.GetActionById(actionId.Trim());
            if (item is null)
            {
                error = $"Action not found: {actionId}";
                return false;
            }

            action = item;
            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    public IEnumerable<ActionItem> EnumerateAll()
    {
        if (!IsAvailable)
        {
            yield break;
        }

        foreach (var item in AppState.DataService.GetAllActionItems())
        {
            if (item is not null)
            {
                yield return item;
            }
        }
    }

    public bool IsXAction(ActionItem action) => action.ActionType == ActionType.XAction;

    public string? GetPayloadJson(ActionItem action) => action.Data;

    public long GetEditVersion(ActionItem action) => ToUnixMilliseconds(action.LastEditTimeUtc);

    public (string Title, string Description, string Icon) GetPresentation(ActionItem action) =>
        (action.Title ?? string.Empty, action.Description ?? string.Empty, action.Icon ?? string.Empty);

    public string GetActionId(ActionItem action) => (action.Id ?? string.Empty).Trim();

    public ActionItem? CloneAction(ActionItem action) =>
        JsonConvert.DeserializeObject<ActionItem>(JsonConvert.SerializeObject(action));

    public bool TryApplyPayloadAndSave(
        ActionItem sourceAction,
        JArray steps,
        JArray variables,
        string subProgramsJson,
        ActionEditMgrAccessor actionEditMgr,
        out string? error)
    {
        error = null;
        if (actionEditMgr.SaveEditingAction is null)
        {
            error = "ActionEditMgr.SaveEditingAction unavailable.";
            return false;
        }

        try
        {
            var payloadJson = GetPayloadJson(sourceAction);
            var body = string.IsNullOrWhiteSpace(payloadJson) ? new JObject() : JObject.Parse(payloadJson);
            body["steps"] = steps;
            body["variables"] = variables;
            if (!string.IsNullOrWhiteSpace(subProgramsJson))
            {
                body["subPrograms"] = JArray.Parse(subProgramsJson);
            }

            var clone = CloneAction(sourceAction);
            if (clone is null)
            {
                error = "Failed to clone action.";
                return false;
            }

            clone.ActionType = ActionType.XAction;
            clone.Data = body.ToString(Formatting.None);
            clone.Data2 = string.Empty;
            clone.Data3 = string.Empty;
            clone.LastEditTimeUtc = GetUtcNowForDb();

            actionEditMgr.SaveEditingAction.Invoke(actionEditMgr.Instance, new object[] { clone });
            TryBackup(clone);
            return true;
        }
        catch (TargetInvocationException ex) when (ex.InnerException is not null)
        {
            error = ex.InnerException.Message;
            return false;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    private static DateTime GetUtcNowForDb()
    {
        var timeHelper = typeof(AppState).Assembly.GetType("Quicker.Common.TimeHelper", throwOnError: false);
        return timeHelper?.GetMethod("GetUtcNowForDb", BindingFlags.Public | BindingFlags.Static)
            ?.Invoke(null, null) as DateTime? ?? DateTime.UtcNow;
    }

    private static void TryBackup(ActionItem action)
    {
        try
        {
            var historyType = typeof(AppState).Assembly.GetType(
                "Quicker.Domain.SQL.Entities.IActionHistoryRepository",
                throwOnError: false);
            if (historyType is null)
            {
                return;
            }

            var repo = typeof(AppState).GetMethod(
                    "GetService",
                    BindingFlags.Public | BindingFlags.Static,
                    binder: null,
                    types: new[] { typeof(Type) },
                    modifiers: null)
                ?.Invoke(null, new object[] { historyType });
            if (repo is null)
            {
                return;
            }

            var backupType = typeof(AppState).Assembly.GetType(
                "Quicker.Domain.SQL.Entities.ActionBackupType",
                throwOnError: false);
            var editComplete = backupType?.GetField("EditComplete", BindingFlags.Public | BindingFlags.Static)
                ?.GetValue(null);

            var backup = repo.GetType().GetMethod("Backup", BindingFlags.Public | BindingFlags.Instance);
            if (backup is not null && editComplete is not null)
            {
                backup.Invoke(repo, new[] { action, editComplete });
            }
        }
        catch
        {
            // best-effort
        }
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
