using System.Collections;
using System.Reflection;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Plugin.Services;

namespace QuickerRpc.Plugin.V2.Reflection;

internal static class QuickerV2StepRunnerCatalogBuilder
{
    public static StepRunnerCatalog Build() => BuildForKnowledge().Catalog;

    internal static StepRunnerKnowledgeProvider.ReadResult BuildForKnowledge()
    {
        if (!QuickerV2Runtime.IsRunningInQuicker) return new(new StepRunnerCatalog());
        return ReadCurrentKnowledge(FindLoadedType(QuickerV2TypeNames.StorageActionStep),
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

    internal static StepRunnerCatalog ReadCurrentService(Type? storageType, Type? serviceType) =>
        ReadCurrentKnowledge(storageType, serviceType).Catalog;

    internal static StepRunnerKnowledgeProvider.ReadResult ReadCurrentKnowledge(Type? storageType, Type? serviceType)
    {
        if (storageType is null || serviceType?.IsInterface != true) return new(new StepRunnerCatalog());
        var property = storageType.GetProperty("StepRunnerService", BindingFlags.Public | BindingFlags.Static);
        var getAll = serviceType.GetMethod("GetAllRunners", BindingFlags.Public | BindingFlags.Instance,
            binder: null, types: Type.EmptyTypes, modifiers: null);
        if (property?.PropertyType != serviceType || property.GetMethod is not { IsPublic: true, IsStatic: true }
            || property.GetIndexParameters().Length != 0 || getAll is null || getAll.ContainsGenericParameters
            || getAll.ReturnType == typeof(string) || !typeof(IEnumerable).IsAssignableFrom(getAll.ReturnType))
            return new(new StepRunnerCatalog());

        // The existing runtime owner is stable even when Quicker's private DI/implementation names are obfuscated.
        // Read it on every request: an unavailable/empty first catalog must not become a permanent process snapshot.
        if (property.GetValue(null) is not { } service || !serviceType.IsInstanceOfType(service)) return new(new StepRunnerCatalog());
        return StepRunnerKnowledgeProvider.ReadCurrent(() => getAll.Invoke(service, null) as IEnumerable,
            runner => QuickerV2StepRunnerMapper.MapRunner(runner, captureKnowledgeEvidence: true));
    }
}
