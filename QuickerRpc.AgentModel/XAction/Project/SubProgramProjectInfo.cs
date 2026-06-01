namespace QuickerRpc.AgentModel.XAction.Project;

/// <summary>Metadata for a local subprogram project (<c>info.json</c>).</summary>
public sealed class SubProgramProjectInfo
{
    public string? Id { get; set; }

    public string? Name { get; set; }

    public string? Description { get; set; }

    public string? Icon { get; set; }

    public string? CallIdentifier { get; set; }

    public long? EditVersion { get; set; }

    public string? ExportedUtc { get; set; }
}
