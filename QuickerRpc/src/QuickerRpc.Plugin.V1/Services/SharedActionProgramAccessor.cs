using System;
using System.Collections.Generic;
using Quicker.Common;
using Quicker.Common.Vm;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Fallback when <see cref="DataServiceActionAccess"/> returns an installed shared action with empty <c>Data</c>.
/// </summary>
internal static class SharedActionProgramAccessor
{
    public static bool TryGetFromSharedCache(
        ActionItem? legacy,
        string actionId,
        out string? bodyJson,
        out string? error)
    {
        bodyJson = null;
        error = null;

        if (!QuickerHost.IsRunningInQuicker())
        {
            return false;
        }

        if (legacy is null)
        {
            DataServiceActionAccess.TryGetById(actionId, out legacy, out _);
        }

        if (!TryResolveSharedKeys(legacy, actionId, out var sharedId, out var revision))
        {
            return false;
        }

        foreach (var rev in DataServiceSharedActionLoader.EnumerateRevisionCandidates(sharedId, revision))
        {
            var dto = DataServiceSharedActionLoader.TryLoad(sharedId, rev);
            if (SharedActionBodyResolver.TryGetBodyJson(dto) is { } json)
            {
                bodyJson = json;
                return true;
            }
        }

        error = $"Shared action program not found (cache/SQL/network): {sharedId:D}";
        return false;
    }

    /// <summary>Runtime lookup and profile catalog scan when DataService and cache miss.</summary>
    public static bool TryGetPayloadFromLegacyFallbacks(string actionId, out string? bodyJson)
    {
        bodyJson = null;
        if (!QuickerHost.IsRunningInQuicker())
        {
            return false;
        }

        return TryGetFromRuntimeLookup(actionId, out bodyJson)
            || TryGetFromCatalogBySharedOrLocalId(actionId, out bodyJson);
    }

    private static bool TryGetFromRuntimeLookup(string actionId, out string? bodyJson)
    {
        bodyJson = null;
        foreach (var useSourceId in new[] { true, false })
        {
            if (ActionRuntimeLookupAccessor.TryGetActionItem(actionId, useSourceId, out var action, out _)
                && TryExtractPayload(action, out bodyJson))
            {
                return true;
            }
        }

        return false;
    }

    private static bool TryGetFromCatalogBySharedOrLocalId(string actionId, out string? bodyJson)
    {
        bodyJson = null;
        var key = (actionId ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            return false;
        }

        foreach (var item in QuickerInternalAccess.EnumerateAllActionItems())
        {
            var localId = (item.Id ?? string.Empty).Trim();
            var sharedId = (item.SharedActionId ?? string.Empty).Trim();
            if (!string.Equals(localId, key, StringComparison.OrdinalIgnoreCase)
                && !string.Equals(sharedId, key, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            if (TryExtractPayload(item, out bodyJson))
            {
                return true;
            }
        }

        return false;
    }

    private static bool TryExtractPayload(ActionItem? action, out string? bodyJson)
    {
        bodyJson = null;
        if (action is null)
        {
            return false;
        }

        if (ActionProgramContent.HasProgramContent(action.Data))
        {
            bodyJson = action.Data;
            return true;
        }

        return false;
    }

    private static bool TryResolveSharedKeys(
        ActionItem? legacy,
        string actionId,
        out Guid sharedId,
        out int revision)
    {
        sharedId = Guid.Empty;
        revision = 0;

        if (legacy is not null)
        {
            // TemplateId is the shared-action store id (see ActionItem remarks in Quicker.Common).
            if (!string.IsNullOrWhiteSpace(legacy.TemplateId)
                && Guid.TryParse(legacy.TemplateId.Trim(), out sharedId))
            {
                revision = legacy.TemplateRevision;
                return true;
            }

            if (!string.IsNullOrWhiteSpace(legacy.SharedActionId)
                && Guid.TryParse(legacy.SharedActionId.Trim(), out sharedId))
            {
                revision = legacy.TemplateRevision;
                return true;
            }
        }

        if (!Guid.TryParse((actionId ?? string.Empty).Trim(), out sharedId))
        {
            return false;
        }

        revision = legacy?.TemplateRevision ?? 0;

        foreach (var rev in DataServiceSharedActionLoader.EnumerateRevisionCandidates(sharedId, revision))
        {
            var dto = DataServiceSharedActionLoader.TryLoad(sharedId, rev);
            if (SharedActionBodyResolver.TryGetBodyJson(dto) is not null)
            {
                revision = rev;
                return true;
            }
        }

        return false;
    }
}
