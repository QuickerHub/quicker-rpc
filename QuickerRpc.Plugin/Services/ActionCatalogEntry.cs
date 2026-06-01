using Quicker.Common;

namespace QuickerRpc.Plugin.Services;

internal readonly struct ActionCatalogEntry
{
    public ActionCatalogEntry(ActionItem action, ActionProfile profile)
    {
        Action = action;
        Profile = profile;
    }

    public ActionItem Action { get; }

    public ActionProfile Profile { get; }
}
