using System;
using System.Threading;
using System.Windows;
using Newtonsoft.Json.Linq;
using Quicker.Common;
using Quicker.Domain.Actions.X;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Persists XAction via <see cref="ActionItem2ProgramAccess"/>; refreshes open Action Designer on the UI thread.
/// </summary>
internal static class ActionProgramPersistence
{
    public static bool TrySave(
        string actionId,
        JArray steps,
        JArray variables,
        string subProgramsJson,
        out string? error)
    {
        error = null;
        var id = (actionId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            error = "actionId is required.";
            return false;
        }

        // Prefer ActionItem2Store (canonical); fall back to legacy ActionItem only when unavailable.
        if (ActionItem2ProgramAccess.TryGetById(id, out var source, out error) && source is not null)
        {
            return TrySaveViaActionItem2(id, source, steps, variables, subProgramsJson, out error);
        }

        if (ActionItem2ProgramAccess.IsAvailable)
        {
            return false;
        }

        return TrySaveLegacyActionItem(id, steps, variables, subProgramsJson, out error);
    }

    private static bool TrySaveViaActionItem2(
        string id,
        object source,
        JArray steps,
        JArray variables,
        string subProgramsJson,
        out string? error)
    {
        error = null;

        var bodyJson = XActionProgramBodyWriter.MergeAndSerialize(
            ActionItem2ProgramAccess.TryGetXActionPayloadJson(source),
            steps,
            variables,
            subProgramsJson);
        var xAction = XActionProgramBodyWriter.DeserializeXAction(bodyJson);

        if (!ActionItem2ProgramAccess.TrySaveXAction(id, xAction, out error))
        {
            return false;
        }

        ActionDesignerUiSave.TrySyncOpenDesignerOnUiThread(id, xAction);
        return true;
    }

    private static bool TrySaveLegacyActionItem(
        string id,
        JArray steps,
        JArray variables,
        string subProgramsJson,
        out string? error)
    {
        error = null;
        if (!TryGetLiveActionItem(id, out var live) || live is null)
        {
            error = $"Action not found: {id}";
            return false;
        }

        var versionBefore = ReadEditVersionMs(id);
        var bodyJson = XActionProgramBodyWriter.MergeAndSerialize(live.Data, steps, variables, subProgramsJson);
        live.ActionType = ActionType.XAction;
        live.Data = bodyJson;
        live.Data2 = string.Empty;
        live.Data3 = string.Empty;

        var xAction = XActionProgramBodyWriter.DeserializeXAction(bodyJson);

        if (!QuickerRpc.Plugin.Reflection.QuickerInternalAccess.TrySaveEditingAction(live, out error))
        {
            return false;
        }

        ActionDesignerUiSave.TrySyncOpenDesignerOnUiThread(id, xAction);
        return true;
    }

    internal static bool TryGetLiveActionItem(string actionId, out ActionItem? action)
    {
        if (ActionItem2ProgramAccess.TryGetById(actionId, out var action2, out _) && action2 is not null)
        {
            action = ActionItem2ProgramAccess.ToLegacyRuntimeAction(action2);
            if (action is not null)
            {
                return true;
            }
        }

        return QuickerRpc.Plugin.Reflection.QuickerInternalAccess.TryGetActionById(actionId, out action);
    }

    private static bool WaitForVersionChange(string actionId, long versionBefore, out long newVersion)
    {
        newVersion = versionBefore;
        for (var i = 0; i < 400; i++)
        {
            if (ActionItem2ProgramAccess.TryGetById(actionId, out var current, out _)
                && current is not null)
            {
                var ms = ActionItem2ProgramAccess.GetEditVersionMs(current);
                if (ms != versionBefore && ms != 0)
                {
                    newVersion = ms;
                    return true;
                }
            }
            else if (TryGetLiveActionItem(actionId, out var legacy) && legacy?.LastEditTimeUtc is DateTime dt)
            {
                var ms = ToUnixMilliseconds(dt);
                if (ms != versionBefore && ms != 0)
                {
                    newVersion = ms;
                    return true;
                }
            }

            ActionDesignerUiSave.PumpDispatcherOnce();
            Thread.Sleep(5);
        }

        return false;
    }

    private static bool PayloadMatches(string actionId, JArray expectedSteps, JArray expectedVariables)
    {
        if (!ActionItem2ProgramAccess.TryGetById(actionId, out var action, out _)
            || action is null)
        {
            return false;
        }

        var current = ActionItem2ProgramAccess.TryGetXActionPayloadJson(action);
        if (string.IsNullOrWhiteSpace(current))
        {
            return false;
        }

        try
        {
            var root = JObject.Parse(current);
            var curSteps = root["steps"] as JArray ?? new JArray();
            var curVars = root["variables"] as JArray ?? new JArray();
            return JToken.DeepEquals(curSteps, expectedSteps)
                && JToken.DeepEquals(curVars, expectedVariables);
        }
        catch
        {
            return false;
        }
    }

    public static long ReadEditVersionMs(string actionId)
    {
        if (ActionItem2ProgramAccess.TryGetById(actionId, out var action2, out _) && action2 is not null)
        {
            return ActionItem2ProgramAccess.GetEditVersionMs(action2);
        }

        if (TryGetLiveActionItem(actionId, out var live) && live?.LastEditTimeUtc is DateTime dt)
        {
            return ToUnixMilliseconds(dt);
        }

        return 0;
    }

    private static long ToUnixMilliseconds(DateTime dt)
    {
        var utc = dt.Kind switch
        {
            DateTimeKind.Utc => dt,
            DateTimeKind.Local => dt.ToUniversalTime(),
            _ => DateTime.SpecifyKind(dt, DateTimeKind.Utc),
        };

        return new DateTimeOffset(utc, TimeSpan.Zero).ToUnixTimeMilliseconds();
    }
}
