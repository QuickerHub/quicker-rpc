using System;
using QuickerRpc.AgentModel.Catalog;

namespace QuickerRpc.Runtime;

/// <summary>Host-specific dependencies for Runtime orchestration (catalog, bridges).</summary>
public sealed class QuickerRpcRuntimeDependencies
{
    public QuickerRpcRuntimeDependencies(
        Func<StepRunnerCatalog> getStepRunnerCatalog,
        string catalogReadSource = "catalog")
    {
        GetStepRunnerCatalog = getStepRunnerCatalog ?? throw new ArgumentNullException(nameof(getStepRunnerCatalog));
        CatalogReadSource = catalogReadSource;
    }

    public Func<StepRunnerCatalog> GetStepRunnerCatalog { get; }

    /// <summary>Wire readSource for catalog-backed action program loads.</summary>
    public string CatalogReadSource { get; }
}
