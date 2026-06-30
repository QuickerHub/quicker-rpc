using System.Collections;
using System.Reflection;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.Plugin.V2.Reflection;

internal static class QuickerV2StepRunnerCatalogBuilder
{
    private static StepRunnerCatalog? _cachedCatalog;
    private static readonly object CatalogLock = new();

    public static StepRunnerCatalog Build()
    {
        lock (CatalogLock)
        {
            return _cachedCatalog ??= BuildCore();
        }
    }

    private static StepRunnerCatalog BuildCore()
    {
        var items = new List<StepRunnerDefinition>();
        if (!QuickerV2Runtime.IsRunningInQuicker)
        {
            return new StepRunnerCatalog();
        }

        var serviceType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.IStepRunnerService)
            ?? AppDomain.CurrentDomain.GetAssemblies()
                .Select(a => a.GetType(QuickerV2TypeNames.IStepRunnerService, throwOnError: false))
                .FirstOrDefault(t => t is not null);
        if (serviceType is null)
        {
            return new StepRunnerCatalog();
        }

        var service = QuickerV2Runtime.TryGetService(serviceType);
        if (service is null)
        {
            return new StepRunnerCatalog();
        }

        var getAll = service.GetType().GetMethod(
            "GetAllRunners",
            BindingFlags.Public | BindingFlags.Instance,
            binder: null,
            types: Type.EmptyTypes,
            modifiers: null);
        if (getAll?.Invoke(service, null) is not IEnumerable runners)
        {
            return new StepRunnerCatalog();
        }

        foreach (var runner in runners)
        {
            if (runner is null)
            {
                continue;
            }

            try
            {
                var mapped = QuickerV2StepRunnerMapper.MapRunner(runner);
                if (mapped is not null)
                {
                    items.Add(mapped);
                }
            }
            catch
            {
                // skip broken runner rows
            }
        }

        return new StepRunnerCatalog { Items = items };
    }
}
