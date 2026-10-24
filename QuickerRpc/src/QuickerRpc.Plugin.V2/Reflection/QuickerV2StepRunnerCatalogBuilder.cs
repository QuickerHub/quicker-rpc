using System.Collections;
using System.Reflection;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.Plugin.V2.Reflection;

internal static class QuickerV2StepRunnerCatalogBuilder
{
    public static StepRunnerCatalog Build()
    {
        if (!QuickerV2Runtime.IsRunningInQuicker) return new StepRunnerCatalog();
        return ReadCurrentService(FindLoadedType(QuickerV2TypeNames.StorageActionStep),
            FindLoadedType(QuickerV2TypeNames.IStepRunnerService));
    }

    private static Type? FindLoadedType(string name)
    {
        foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
        {
            if (assembly.IsDynamic || assembly.GetName().Name != "Quicker.StepEngine") continue;
            var type = assembly.GetType(name, throwOnError: false, ignoreCase: false);
            if (type is not null) return type;
        }
        return null;
    }

    internal static StepRunnerCatalog ReadCurrentService(Type? storageType, Type? serviceType)
    {
        if (storageType is null || serviceType?.IsInterface != true) return new StepRunnerCatalog();
        var property = storageType.GetProperty("StepRunnerService", BindingFlags.Public | BindingFlags.Static);
        var getAll = serviceType.GetMethod("GetAllRunners", BindingFlags.Public | BindingFlags.Instance,
            binder: null, types: Type.EmptyTypes, modifiers: null);
        if (property?.PropertyType != serviceType || property.GetMethod is not { IsPublic: true, IsStatic: true }
            || property.GetIndexParameters().Length != 0 || getAll is null || getAll.ContainsGenericParameters
            || getAll.ReturnType == typeof(string) || !typeof(IEnumerable).IsAssignableFrom(getAll.ReturnType))
            return new StepRunnerCatalog();

        // The existing runtime owner is stable even when Quicker's private DI/implementation names are obfuscated.
        // Read it on every request: an unavailable/empty first catalog must not become a permanent process snapshot.
        if (property.GetValue(null) is not { } service || !serviceType.IsInstanceOfType(service)
            || getAll.Invoke(service, null) is not IEnumerable runners) return new StepRunnerCatalog();

        var items = new List<StepRunnerDefinition>();
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
