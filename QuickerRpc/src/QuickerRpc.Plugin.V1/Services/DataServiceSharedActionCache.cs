using System;
using System.Linq;
using System.Reflection;
using Quicker.Common.Vm;
using Quicker.Domain;
using Quicker.Domain.Services;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Reads installed shared actions from <see cref="LocalSharedActionCache"/> on <see cref="DataService"/>.
/// The cache field is private (obfuscated name on Release); resolved once by type.
/// </summary>
internal static class DataServiceSharedActionCache
{
    private const BindingFlags InstanceFlags = BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public;

    private static readonly Lazy<Func<DataService, LocalSharedActionCache?>> CacheResolver = new(BuildCacheResolver);

    public static SharedActionDto? Get(Guid sharedActionId, int revision)
    {
        var dataService = AppState.DataService;
        if (dataService is null)
        {
            return null;
        }

        var cache = CacheResolver.Value(dataService);
        if (cache is null)
        {
            return null;
        }

        return QuickerDispatcherInvoke.OnUiThreadIfNeeded(() => cache.Get(sharedActionId, revision));
    }

    private static Func<DataService, LocalSharedActionCache?> BuildCacheResolver()
    {
        var field = typeof(DataService)
            .GetFields(InstanceFlags)
            .FirstOrDefault(f => f.FieldType == typeof(LocalSharedActionCache));
        if (field is null)
        {
            return _ => null;
        }

        return ds => (LocalSharedActionCache?)field.GetValue(ds);
    }

}
