using System.Collections.Generic;

namespace QuickerRpc.Plugin.Catalog.Designer;

/// <summary>UI step-runner catalog for action-editor quick insert (parity with Designer GetStepRunnersResponse).</summary>
internal sealed class DesignerStepRunnerUiCatalog
{
    public IList<DesignerStepRunnerUiItem> Items { get; set; } = new List<DesignerStepRunnerUiItem>();
}

internal sealed class DesignerStepRunnerUiItem
{
    public string Key { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public string Icon { get; set; } = string.Empty;

    public IList<string> Keywords { get; set; } = new List<string>();

    public IList<DesignerStepRunnerUiSubItem> SubItems { get; set; } = new List<DesignerStepRunnerUiSubItem>();
}

internal sealed class DesignerStepRunnerUiSubItem
{
    public string Key { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;
}
