namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>Options for <see cref="XActionFileRefExporter.Export"/>.</summary>
public sealed class XActionFileRefExportOptions
{
    /// <summary>Default for <c>action extract --min-lines</c>: externalize when line count is greater than this.</summary>
    public const int DefaultAutoExternalizeMinLines = 4;

    /// <summary>
    /// When greater than zero, inline <c>inputParams.*.value</c> strings with more than this many
    /// lines are written to <c>files/{module}{n}.{ext}</c> and replaced with <c>file</c> refs.
    /// </summary>
    public int AutoExternalizeMinLines { get; set; }
}
