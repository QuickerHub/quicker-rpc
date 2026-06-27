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

        var authenticatedUsers = new SecurityIdentifier(WellKnownSidType.AuthenticatedUserSid, null);
        ps.AddAccessRule(new PipeAccessRule(
            authenticatedUsers,
            PipeAccessRights.FullControl,
            AccessControlType.Allow));

        try
        {
            using var identity = WindowsIdentity.GetCurrent();
            if (identity.User is not null)
            {
                ps.AddAccessRule(new PipeAccessRule(
                    identity.User,
                    PipeAccessRights.FullControl,
                    AccessControlType.Allow));
            }
        }
        catch
        {
            // ignore
        }

        return ps;
    }
}
