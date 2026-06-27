namespace QuickerRpc.Plugin.Services;

internal enum ActionSourceFilterKind
{
    Library,
    Local,
    Published,
    SharedId,
}

internal readonly struct ActionSourceFilter
{
    public ActionSourceFilter(ActionSourceFilterKind kind, string? sharedId = null)
    {
        Kind = kind;
        SharedId = sharedId;
    }

    public ActionSourceFilterKind Kind { get; }

    public string? SharedId { get; }
}
