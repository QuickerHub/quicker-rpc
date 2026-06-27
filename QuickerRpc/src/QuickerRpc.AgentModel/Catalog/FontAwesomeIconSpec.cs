using System;

namespace QuickerRpc.AgentModel.Catalog;

/// <summary>Build Quicker action/subprogram Font Awesome icon spec strings.</summary>
public static class FontAwesomeIconSpec
{
    /// <summary>
    /// <c>fa:{enumName}</c> or <c>fa:{enumName}:{#color}</c> (color optional).
    /// <paramref name="enumName"/> is e.g. <c>Light_Flask</c> from <c>fa search</c> <c>names[]</c> (not <c>fa:</c> prefixed).
    /// </summary>
    public static string Format(string enumName, string? colorHex = null)
    {
        var name = (enumName ?? string.Empty).Trim();
        if (name.Length == 0)
        {
            return string.Empty;
        }

        if (name.StartsWith("fa:", StringComparison.OrdinalIgnoreCase))
        {
            name = name.Substring(3).Trim();
        }

        if (name.Length == 0)
        {
            return string.Empty;
        }

        var spec = "fa:" + name;
        if (string.IsNullOrWhiteSpace(colorHex))
        {
            return spec;
        }

        var color = colorHex.Trim();
        if (color.Length == 0)
        {
            return spec;
        }

        if (!color.StartsWith("#", StringComparison.Ordinal))
        {
            color = "#" + color;
        }

        return spec + ":" + color;
    }
}
