using System;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Transport;

/// <summary>Unknown/new methods are mutating until explicitly classified.</summary>
public static class QuickerRpcMethodPolicy
{
    public static bool IsReadOnly(string method) => method == "PingAsync"
        || method.StartsWith("Get", StringComparison.Ordinal) || method.StartsWith("Search", StringComparison.Ordinal)
        || method.StartsWith("List", StringComparison.Ordinal) || method.StartsWith("Check", StringComparison.Ordinal)
        || method.StartsWith("Preflight", StringComparison.Ordinal) || method == "ReadClipboardSpecialFormatAsync"
        || method == "ResolveFontAwesomeIconsAsync" || method == "ResolveSettingsIntentAsync"
        || method == "ResolveLauncherIntentAsync";

    public static string? Capability(string method) => method switch
    {
        "GetActionProgramSourceAsync" => QuickerRpcHostCapabilityNames.ActionSourceRead,
        "ApplyActionProgramSourceAsync" => QuickerRpcHostCapabilityNames.ActionSourceWrite,
        "GetCompressedActionByIdAsync" => QuickerRpcHostCapabilityNames.ActionLegacyBodyRead,
        "ApplyXActionToActionAsync" => QuickerRpcHostCapabilityNames.ActionLegacyBodyWrite,
        "ApplyActionPatchToActionAsync" => QuickerRpcHostCapabilityNames.ActionLegacyBodyPatch,
        "UpdateActionMetadataAsync" => QuickerRpcHostCapabilityNames.ActionPresentationWrite,
        "GetActionDesignerContextAsync" => QuickerRpcHostCapabilityNames.DesignerContextRead,
        _ => null,
    };
}
