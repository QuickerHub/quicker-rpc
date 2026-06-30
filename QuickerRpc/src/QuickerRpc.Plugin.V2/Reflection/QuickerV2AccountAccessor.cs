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
        new()
        {
            Ok = false,
            LoggedIn = false,
            Message = "Web session probe is not implemented for Quicker V2 reflection host yet.",
        };

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
