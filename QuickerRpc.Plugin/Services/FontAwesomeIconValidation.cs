using System.Collections.Generic;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Plugin;

namespace QuickerRpc.Plugin.Services;

internal static class FontAwesomeIconValidation
{
    public static bool TryValidate(string? icon, bool allowEmpty, out string? error)
    {
        if (allowEmpty && string.IsNullOrWhiteSpace(icon))
        {
            error = null;
            return true;
        }

        ICollection<string>? known = null;
        if (AppServices.IsInitialized)
        {
            known = AppServices.GetRequired<FontAwesomeIconSearchService>().KnownEnumNames;
        }

        return FontAwesomeIconSpecValidator.TryValidate(icon, allowEmpty, known, out error);
    }
}
