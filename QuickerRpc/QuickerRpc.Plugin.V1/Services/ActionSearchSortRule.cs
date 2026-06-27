namespace QuickerRpc.Plugin.Services;

internal sealed class ActionSearchSortRule
{
    public ActionSearchSortRule(string script, bool descending = false)
    {
        Script = script;
        Descending = descending;
    }

    public string Script { get; }

    public bool Descending { get; }
}
