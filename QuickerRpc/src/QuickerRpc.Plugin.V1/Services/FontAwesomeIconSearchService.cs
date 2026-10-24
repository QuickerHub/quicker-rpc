using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Collections.Immutable;
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
    private readonly Lazy<ImmutableHashSet<string>> _enumNames;
    private readonly Lazy<IReadOnlyList<string>> _pageNames;

    public FontAwesomeIconSearchService()
    {
        _catalog = new Lazy<IReadOnlyList<FontAwesomeIconEntry>>(BuildCatalog, isThreadSafe: true);
        _pageNames = new Lazy<IReadOnlyList<string>>(() => _catalog.Value.Select(entry => entry.Name).OrderBy(name => name, StringComparer.OrdinalIgnoreCase).ToArray(), isThreadSafe: true);
        _enumNames = new Lazy<ImmutableHashSet<string>>(
            () => _catalog.Value.Select(e => e.Name).ToImmutableHashSet(StringComparer.Ordinal),
            isThreadSafe: true);
    }

    public ICollection<string> KnownEnumNames => _enumNames.Value;
    public bool IsPageAvailable
    {
        get
        {
            try { return FontAwesomeIconPageSearch.IsKeywordResourceAvailable && HasPageEnum(); }
            catch { return false; }
        }
    }
    // Keep dependency resolution inside a separate call so a missing enum assembly is caught by the probe.
    [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
    private static bool HasPageEnum() => typeof(EFontAwesomeIcon).IsEnum;

    public QuickerRpcFontAwesomePageResult SearchPage(string? query, string? style, int skip, int take)
    {
        try
        {
            var page = FontAwesomeIconPageSearch.Search(_pageNames.Value, query, style, skip, take);
            return new() { Success = true, Names = page.Names.ToList(), Query = page.Query, Style = page.Style,
                Skip = page.Skip, Take = page.Take, TotalCount = page.TotalCount, HasMore = page.HasMore };
        }
        catch (Exception error) { return new() { Success = false, ErrorMessage = "UNSUPPORTED_HOST: Font Awesome paging is unavailable. " + error.Message }; }
    }

    public bool TryValidateIconSpec(string? spec, bool allowEmpty, out string? errorMessage) =>
        FontAwesomeIconSpecValidator.TryValidate(spec, allowEmpty, KnownEnumNames, out errorMessage);

    public QuickerRpcResolveFontAwesomeIconsResult ResolveMany(IList<string>? specs)
    {
        var result = new QuickerRpcResolveFontAwesomeIconsResult { Success = true };
        if (specs is null || specs.Count == 0)
        {
            return result;
        }

        const int max = 80;
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var raw in specs)
        {
            if (result.Items.Count >= max)
            {
                result.Errors.Add($"Only first {max} unique specs are resolved per call.");
                break;
            }

            var spec = (raw ?? string.Empty).Trim();
            if (spec.Length == 0 || !seen.Add(spec))
            {
                continue;
            }

            if (TryResolveGeometry(spec, out var geometry, out var error))
            {
                result.Items.Add(geometry!);
            }
            else
            {
                result.Errors.Add($"{spec}: {error}");
            }
        }

        return result;
    }

    public bool TryResolveGeometry(
        string? spec,
        out QuickerRpcFontAwesomeIconGeometry? geometry,
        out string? error)
    {
        geometry = null;
        error = null;
        if (!FontAwesomeIconSpecValidator.TryParse(spec, allowEmpty: false, out var enumName, out var color, out error))
        {
            return false;
        }

        if (!_enumNames.Value.Contains(enumName))
        {
            error =
                $"Unknown icon enum '{enumName}'. Run qkrpc fa search --query <keyword> --json.";
            return false;
        }

        var field = typeof(EFontAwesomeIcon).GetField(
            enumName,
            BindingFlags.Public | BindingFlags.Static);
        if (field is null)
        {
            error = $"Icon enum '{enumName}' not found in catalog.";
            return false;
        }

        var svg = field.GetCustomAttribute<FontAwesomeSvgInformationAttribute>();
        if (svg is null || string.IsNullOrWhiteSpace(svg.Path))
        {
            error = $"No SVG path metadata for '{enumName}'.";
            return false;
        }

        var info = field.GetCustomAttribute<FontAwesomeInformationAttribute>();
        geometry = new QuickerRpcFontAwesomeIconGeometry
        {
            Spec = spec!.Trim(),
            EnumName = enumName,
            Path = svg.Path.Trim(),
            Width = svg.Width > 0 ? svg.Width : 512,
            Height = svg.Height > 0 ? svg.Height : 512,
            Color = color,
            Label = info?.Label ?? enumName,
            Unicode = info?.Unicode ?? 0,
        };
        return true;
    }

    public QuickerRpcSearchFontAwesomeIconsResult Search(
        string? query,
        int? maxResults,
        bool expand = false)
    {
        try
        {
            var mapped = FontAwesomeIconSearch.Search(
                _catalog.Value,
                query,
                maxResults,
                expand);
            return new QuickerRpcSearchFontAwesomeIconsResult
            {
                Success = mapped.Success,
                ErrorMessage = mapped.ErrorMessage,
                Keyword = mapped.Keyword,
                MatchCount = mapped.MatchCount,
                Names = mapped.Names,
                DefaultStyle = mapped.DefaultStyle,
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
