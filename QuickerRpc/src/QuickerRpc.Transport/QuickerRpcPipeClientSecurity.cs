using System;
using System.IO.Pipes;
using System.Security.Principal;

namespace QuickerRpc.Transport;

#if NET10_0_OR_GREATER
[System.Runtime.Versioning.SupportedOSPlatform("windows")]
#endif
internal static class QuickerRpcPipeClientSecurity
{
    public static void RequireCurrentUserOwner(PipeStream pipe)
    {
        using var identity = WindowsIdentity.GetCurrent();
        RequireOwner(pipe.GetAccessControl().GetOwner(typeof(SecurityIdentifier)), identity.User);
    }

    internal static void RequireOwner(IdentityReference? owner, SecurityIdentifier? user)
    {
        // Token.Owner may be Administrators for an elevated token. The server belongs to Token.User.
        if (owner is null || user is null || !owner.Equals(user))
            throw new UnauthorizedAccessException("The pipe owner is not the current user.");
    }
}
