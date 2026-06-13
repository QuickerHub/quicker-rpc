namespace QuickerRpc.Plugin.Services;

internal enum SubProgramReferenceTargetKind
{
    Action,
    GlobalSubProgram,
}

internal sealed class SubProgramReferenceHit
{
    public SubProgramReferenceTargetKind Kind { get; init; }

    public string Title { get; init; } = string.Empty;

    public string Id { get; init; } = string.Empty;

    public string DisplayLabel => Kind switch
    {
        SubProgramReferenceTargetKind.Action => "[动作] " + Title,
        SubProgramReferenceTargetKind.GlobalSubProgram => "[公共子程序] " + Title,
        _ => Title,
    };
}
