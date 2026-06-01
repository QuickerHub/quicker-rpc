using System.Collections.Generic;
using Quicker.Domain.Profiles;

namespace QuickerRpc.Plugin.Services;

internal static class ActionCatalogEnumerator
{
    public static IEnumerable<ActionCatalogEntry> Enumerate(string? scope)
    {
        var manager = ProfileManagerAccessor.TryCreate()?.Instance;
        if (manager is null)
        {
            yield break;
        }

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
    }
}
