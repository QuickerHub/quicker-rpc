namespace QuickerRpc.AgentModel.XAction;

/// <summary>Read shape for compressed XAction payloads (<c>action_get</c>).</summary>
public enum XActionGetReturnMode
{
    /// <summary>Steps and variables with compressed input/output params (default).</summary>
    Full,

    /// <summary>Step tree with stepId and stepRunnerKey only; no inputParams/outputParams.</summary>
    Structure,

    /// <summary>Catalog metadata plus step/variable outline (no param bodies).</summary>
    Metadata,

    /// <summary>Native program body for ActionRuntime execution (no agent compression).</summary>
    Runtime
}

public static class XActionGetReturnModeParser
{
    public static bool TryParse(string? raw, out XActionGetReturnMode mode, out string? error)
    {
        mode = XActionGetReturnMode.Full;
        error = null;
        if (string.IsNullOrWhiteSpace(raw))
        {
            return true;
        }

        switch (raw!.Trim().ToLowerInvariant())
        {
            case "full":
                mode = XActionGetReturnMode.Full;
                return true;
            case "structure":
                mode = XActionGetReturnMode.Structure;
                return true;
            case "metadata":
                mode = XActionGetReturnMode.Metadata;
                return true;
            case "runtime":
                mode = XActionGetReturnMode.Runtime;
                return true;
            default:
                error = "returnMode must be full, structure, metadata, or runtime.";
                return false;
        }
    }

    public static string ToWire(XActionGetReturnMode mode) =>
        mode switch
        {
            XActionGetReturnMode.Structure => "structure",
            XActionGetReturnMode.Metadata => "metadata",
            XActionGetReturnMode.Runtime => "runtime",
            _ => "full"
        };
}
