using System;
using System.Linq;
using System.Reflection;
using Quicker.Domain;
using Quicker.Domain.Profiles;

namespace QuickerRpc.Plugin.Services;

/// <summary>Cached access to Quicker <see cref="ProfileManager"/> via <see cref="AppState.AppServer"/>.</summary>
internal sealed class ProfileManagerAccessor
{
    private ProfileManagerAccessor(ProfileManager instance)
    {
        Instance = instance;
    }

    public ProfileManager Instance { get; }

    public static ProfileManagerAccessor? TryCreate()
    {
        if (!QuickerHost.IsRunningInQuicker())
        {
            return null;
        }

        try
        {
            var appServer = AppState.AppServer;
            if (appServer is null)
            {
                return null;
            }

            var field = appServer.GetType()
                .GetFields(BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public)
                .FirstOrDefault(f => f.FieldType == typeof(ProfileManager));
            if (field?.GetValue(appServer) is not ProfileManager manager)
            {
                return null;
            }

            return new ProfileManagerAccessor(manager);
        }
        catch
        {
            return null;
        }
    }
}
