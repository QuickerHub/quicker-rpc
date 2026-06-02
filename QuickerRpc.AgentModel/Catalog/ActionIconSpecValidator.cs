using System;
using System.Collections.Generic;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>
/// Validates Quicker action/subprogram <c>icon</c> values: Font Awesome <c>fa:</c> specs or absolute image URLs.
/// </summary>
public static class ActionIconSpecValidator
{
    public const int MaxLength = 2048;

    /// <summary>
    /// Validates <paramref name="spec"/> as <c>fa:{enumName}</c>[:{#color}] or an absolute http/https URL.
    /// </summary>
    public static bool TryValidate(
        string? spec,
        bool allowEmpty,
        ICollection<string>? knownFaEnumNames,
        out string? error)
    {
        error = null;
        if (spec is null)
        {
            if (allowEmpty)
            {
                return true;
            }

            error = "icon is required.";
            return false;
        }

        var trimmed = spec.Trim();
        if (trimmed.Length == 0)
        {
            if (allowEmpty)
            {
                return true;
            }

            error = "icon cannot be empty; omit the field or use \"\" to clear.";
            return false;
        }

        if (trimmed.StartsWith("fa:", StringComparison.OrdinalIgnoreCase))
        {
            return FontAwesomeIconSpecValidator.TryValidate(trimmed, allowEmpty: false, knownFaEnumNames, out error);
        }

        if (TryValidateHttpUrl(trimmed, out error))
        {
            return true;
        }

        if (error is null)
        {
            error =
                "icon must be fa:... (see qkrpc guide get --topic action-icons) or an absolute http/https URL (e.g. https://files.getquicker.net/_icons/....png).";
        }

        return false;
    }

    private static bool TryValidateHttpUrl(string trimmed, out string? error)
    {
        error = null;
        if (trimmed.Length > MaxLength)
        {
            error = $"icon URL exceeds maximum length ({MaxLength}).";
            return false;
        }

        if (!Uri.TryCreate(trimmed, UriKind.Absolute, out var uri))
        {
            return false;
        }

        if (!string.Equals(uri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase)
            && !string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        if (string.IsNullOrEmpty(uri.Host))
        {
            error = "icon URL is missing a host.";
            return false;
        }

        return true;
    }
}
