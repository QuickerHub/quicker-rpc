using System.Reflection;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.V2.Reflection;

internal static class QuickerV2AccountAccessor
{
    public static QuickerRpcAccountInfo TryGetAccountInfo()
    {
        if (!QuickerV2Runtime.IsRunningInQuicker)
        {
            return new QuickerRpcAccountInfo
            {
                Ok = false,
                LoggedIn = false,
                Message = "Not running inside Quicker.",
            };
        }

        var serviceType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.IUserInfoService);
        var service = serviceType is null ? null : QuickerV2Runtime.TryGetService(serviceType);
        if (service is null)
        {
            return new QuickerRpcAccountInfo
            {
                Ok = false,
                LoggedIn = false,
                Message = "IUserInfoService unavailable.",
            };
        }

        try
        {
            var userId = ReadProperty<string>(service, "UserId");
            return new QuickerRpcAccountInfo
            {
                Ok = true,
                LoggedIn = !string.IsNullOrWhiteSpace(userId),
                UserId = userId,
                UserName = ReadProperty<string>(service, "UserName"),
                NickName = ReadProperty<string>(service, "NickName"),
            };
        }
        catch (Exception ex)
        {
            return new QuickerRpcAccountInfo
            {
                Ok = false,
                LoggedIn = false,
                Message = ex.Message,
            };
        }
    }

    public static QuickerRpcWebSessionInfo TryGetWebSessionInfo() =>
        BuildWebSessionInfo();

    internal static string? TryGetBearerToken()
    {
        if (!QuickerV2Runtime.IsRunningInQuicker)
        {
            return null;
        }

        try
        {
            var stateType = QuickerV2Runtime.ResolveType(QuickerV2TypeNames.InternalState);
            var getToken = stateType?.GetMethod(
                "GetToken",
                BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static,
                binder: null,
                types: Type.EmptyTypes,
                modifiers: null);
            var token = getToken?.Invoke(null, null)?.ToString()?.Trim();
            return string.IsNullOrEmpty(token) ? null : token;
        }
        catch
        {
            return null;
        }
    }

    private static QuickerRpcWebSessionInfo BuildWebSessionInfo()
    {
        var account = TryGetAccountInfo();
        if (!account.LoggedIn || string.IsNullOrWhiteSpace(account.UserId))
        {
            return new QuickerRpcWebSessionInfo
            {
                Ok = account.Ok,
                LoggedIn = false,
                Message = account.Message ?? "Quicker account is not logged in.",
            };
        }

        var token = TryGetBearerToken();
        if (string.IsNullOrEmpty(token))
        {
            return new QuickerRpcWebSessionInfo
            {
                Ok = true,
                LoggedIn = false,
                UserId = account.UserId,
                Message = "Quicker is logged in but web session token is unavailable.",
            };
        }

        return new QuickerRpcWebSessionInfo
        {
            Ok = true,
            LoggedIn = true,
            UserId = account.UserId,
            Token = token,
        };
    }

    private static T? ReadProperty<T>(object target, string propertyName)
    {
        var prop = target.GetType().GetProperty(propertyName, BindingFlags.Public | BindingFlags.Instance);
        if (prop is null)
        {
            return default;
        }

        return (T?)prop.GetValue(target);
    }
}
