using System;
using System.Security.Cryptography;
using System.Text;

namespace QuickerRpc.Contracts.Rpc;

/// <summary>Names are discoverable only within the current OS account namespace; no PID registry.</summary>
public static class QuickerRpcEndpointNames
{
    public static string CurrentUserPrefix
    {
        get
        {
            using var hash = SHA256.Create();
            var bytes = hash.ComputeHash(Encoding.UTF8.GetBytes(Environment.UserDomainName + "\\" + Environment.UserName));
            return "QuickerRpc_User_" + BitConverter.ToString(bytes, 0, 12).Replace("-", "") + "_";
        }
    }

    public static string ForSession(string sessionId) => CurrentUserPrefix + sessionId;

    public static bool IsCurrentUserEndpoint(string endpoint) => endpoint is not null
        && endpoint.StartsWith(CurrentUserPrefix, StringComparison.Ordinal)
        && Guid.TryParseExact(endpoint.Substring(CurrentUserPrefix.Length), "N", out _);
}
