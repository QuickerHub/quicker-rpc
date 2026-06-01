using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using FontAwesome5;
using QuickerRpc.AgentModel.Catalog;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Lazy Font Awesome icon catalog from <see cref="EFontAwesomeIcon"/> (same assembly as Quicker UI).
/// </summary>
public sealed class FontAwesomeIconSearchService
{
    private readonly Lazy<IReadOnlyList<FontAwesomeIconEntry>> _catalog;

    public FontAwesomeIconSearchService()
    {
        _catalog = new Lazy<IReadOnlyList<FontAwesomeIconEntry>>(BuildCatalog, isThreadSafe: true);
    }

    public QuickerRpcSearchFontAwesomeIconsResult Search(
        string? query,
        int? maxResults,
        bool includeAllStyles = false)
    {
        try
        {
            var mapped = FontAwesomeIconSearch.Search(
                _catalog.Value,
                query,
                maxResults,
                includeAllStyles);
            return new QuickerRpcSearchFontAwesomeIconsResult
            {
                Success = mapped.Success,
                ErrorMessage = mapped.ErrorMessage,
                Keyword = mapped.Keyword,
                MatchCount = mapped.MatchCount,
                Names = mapped.Names,
            };
        }
        catch (Exception ex)
        {
            return new QuickerRpcSearchFontAwesomeIconsResult
            {
                Success = false,
                ErrorMessage = ex.Message,
            };
        }
    }

    private static IReadOnlyList<FontAwesomeIconEntry> BuildCatalog()
    {
        var enumType = typeof(EFontAwesomeIcon);
        var list = new List<FontAwesomeIconEntry>();

        foreach (var name in Enum.GetNames(enumType))
        {
            if (string.Equals(name, "None", StringComparison.Ordinal))
            {
                continue;
            }

            var field = enumType.GetField(name, BindingFlags.Public | BindingFlags.Static);
            if (field is null)
            {
                continue;
            }

            var info = field.GetCustomAttribute<FontAwesomeInformationAttribute>();
            var style = info?.Style.ToString() ?? InferStyleFromName(name);
            var label = info?.Label ?? name;
            var unicode = info?.Unicode ?? 0;

            list.Add(new FontAwesomeIconEntry
            {
                Name = name,
                Style = style,
                Label = label,
                Unicode = unicode,
                Icon = "fa:" + name,
            });
        }

        return list;
    }

    private static string InferStyleFromName(string enumName)
    {
        var idx = enumName.IndexOf('_');
        return idx > 0 ? enumName.Substring(0, idx) : string.Empty;
    }
}
