namespace QuickerRpc.Plugin.Services;

/// <summary>Reserved virtual process / action-page namespace for headless qkrpc-created actions.</summary>
internal static class QkrpcVirtualActionHost
{
    /// <summary>Virtual process key (Quicker ExeFile) for agent-created actions.</summary>
    public const string VirtualExeFile = "_qkrpc_agent";

    /// <summary>Prefix for auto-created virtual action page names.</summary>
    public const string ProfileNamePrefix = "@qkrpc ";

    /// <summary>Scope token for <see cref="ActionScopeResolver"/> / CLI <c>--scope agent</c>.</summary>
    public const string AgentScope = "agent";
}
