namespace QuickerRpc.Plugin.Services;

/// <summary>Virtual process namespace for actions that invoke the CeaCore_Run subprogram.</summary>
internal static class CeaCoreRunVirtualActionHost
{
    public const string VirtualExeFile = "_ceacore_run";

    public const string DisplayName = "CeaCore Run";

    public const string ProfileNamePrefix = "@CeaCore ";

    public const string SubProgramName = "CeaCore_Run";

    /// <summary>CLI/RPC scope token (<c>qkrpc action list --scope ceacore</c>).</summary>
    public const string Scope = "ceacore";
}
