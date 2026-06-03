namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>Options for <see cref="XActionFileRefExporter.Export"/>.</summary>
public sealed class XActionFileRefExportOptions
{
    /// <summary>
    /// When greater than zero, inline <c>inputParams.*.value</c> strings with more than this many
    /// lines are written to <c>files/{module}{n}.{ext}</c> and replaced with <c>file</c> refs.
    /// </summary>
    public int AutoExternalizeMinLines { get; set; }
}
