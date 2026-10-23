using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;

namespace QuickerRpc.Transport;

/// <summary>
/// Pipe DACL so elevated CLI clients can connect to the medium-IL Quicker RPC server.
/// </summary>
public static class QuickerRpcPipeSecurity
{
    public static PipeSecurity CreateForCrossElevationPeers()
    {
        var ps = new PipeSecurity();

        using var identity = WindowsIdentity.GetCurrent();
        var user = identity.User ?? throw new System.InvalidOperationException("Current user SID is unavailable.");
        ps.SetOwner(user);
        ps.SetAccessRuleProtection(true, false);
        ps.AddAccessRule(new PipeAccessRule(user, PipeAccessRights.FullControl, AccessControlType.Allow));

        return ps;
    }
}
