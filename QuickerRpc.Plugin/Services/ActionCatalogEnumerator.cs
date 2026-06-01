using System.Collections.Generic;
using Quicker.Common;
using Quicker.Domain.Profiles;
using QuickerRpc.Plugin.Reflection;

namespace QuickerRpc.Plugin.Services;

internal static class ActionCatalogEnumerator
{
    public static IEnumerable<ActionCatalogEntry> Enumerate(string? scope)
    {
        var manager = ProfileManagerAccessor.TryCreate()?.Instance;
        if (manager is not null)
        {
            foreach (var profile in ActionScopeResolver.ResolveProfiles(manager, scope))
            {
                if (profile?.ActionItems is null)
                {
                    continue;
                }

                foreach (var action in profile.ActionItems)
                {
                    if (action is not null)
                    {
                        yield return new ActionCatalogEntry(action, profile);
                    }
                }
            }

            yield break;
        }

        if (!string.IsNullOrWhiteSpace(scope))
        {
            yield break;
        }

        foreach (var action in EnumerateCatalogStoreFallback())
        {
            yield return action;
        }
    }

    private static IEnumerable<ActionCatalogEntry> EnumerateCatalogStoreFallback()
    {
        if (!QuickerInternalAccess.IsCatalogAvailable)
        {
            yield break;
        }

        foreach (var action in QuickerInternalAccess.EnumerateAllActionItems())
        {
            ActionProfile? profile = null;
            var id = (action.Id ?? string.Empty).Trim();
            if (id.Length > 0
                && DataServiceActionAccess.TryGetById(id, out _, out var resolvedProfile))
            {
                profile = resolvedProfile;
            }

            yield return new ActionCatalogEntry(action, profile);
        }
    }
}
