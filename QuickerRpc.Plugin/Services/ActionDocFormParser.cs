using System;
using System.Collections.Generic;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.Plugin.Services;

/// <summary>Parses getquicker.net Member/Action/Edit MVC form fields for action-doc sync.</summary>
internal static class ActionDocFormParser
{
    public const string DetailFieldName = "SharedActionVm.Detail";

    public const string DetailTextareaId = "SharedActionVm_Detail";

    private static readonly Regex FormTagRegex = new(
        @"<form\b([^>]*)>",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex ActionAttrRegex = new(
        @"\baction\s*=\s*(""([^""]*)""|'([^']*)'|([^\s>]+))",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex InputTagRegex = new(
        @"<input\b([^>]*)/?>",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex TextareaTagRegex = new(
        @"<textarea\b([^>]*)>([\s\S]*?)</textarea>",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex NameAttrRegex = new(
        @"\bname\s*=\s*(""([^""]*)""|'([^']*)'|([^\s>]+))",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex IdAttrRegex = new(
        @"\bid\s*=\s*(""([^""]*)""|'([^']*)'|([^\s>]+))",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex ValueAttrRegex = new(
        @"\bvalue\s*=\s*(""([^""]*)""|'([^']*)'|([^\s>]+))",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    private static readonly Regex TypeAttrRegex = new(
        @"\btype\s*=\s*(""([^""]*)""|'([^']*)'|([^\s>]+))",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    public sealed class ParsedForm
    {
        public string ActionUrl { get; init; } = string.Empty;

        public string Method { get; init; } = "POST";

        public Dictionary<string, string> Fields { get; } =
            new(StringComparer.Ordinal);

        public List<string> FileFieldNames { get; } = new();

        public string? DetailHtml =>
            Fields.TryGetValue(DetailFieldName, out var html) ? html : null;
    }

    public static bool TryParse(string html, string pageUrl, out ParsedForm? form, out string? error)
    {
        form = null;
        error = null;

        if (string.IsNullOrWhiteSpace(html))
        {
            error = "Edit page HTML is empty.";
            return false;
        }

        Match? formMatch = null;
        string? formSegment = null;
        foreach (Match candidate in FormTagRegex.Matches(html))
        {
            var segmentStart = candidate.Index;
            var segmentEnd = html.IndexOf("</form>", segmentStart, StringComparison.OrdinalIgnoreCase);
            if (segmentEnd < 0)
            {
                continue;
            }

            var segment = html.Substring(segmentStart, segmentEnd - segmentStart);
            if (segment.Contains(DetailTextareaId, StringComparison.OrdinalIgnoreCase)
                || segment.Contains(DetailFieldName, StringComparison.OrdinalIgnoreCase))
            {
                formMatch = candidate;
                formSegment = segment;
                break;
            }
        }

        formMatch ??= FormTagRegex.Match(html);
        if (!formMatch.Success)
        {
            error = "Edit form not found on page.";
            return false;
        }

        formSegment ??= ExtractFormSegment(html, formMatch.Index);
        if (string.IsNullOrEmpty(formSegment))
        {
            error = "Edit form segment not found on page.";
            return false;
        }

        var formAttrs = formMatch.Groups[1].Value;
        var action = ReadAttr(ActionAttrRegex, formAttrs) ?? pageUrl;
        var method = "POST";
        var methodAttr = Regex.Match(
            formAttrs,
            @"\bmethod\s*=\s*(""([^""]*)""|'([^']*)'|([^\s>]+))",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
        if (methodAttr.Success)
        {
            method = (methodAttr.Groups[2].Success ? methodAttr.Groups[2].Value
                : methodAttr.Groups[3].Success ? methodAttr.Groups[3].Value
                : methodAttr.Groups[4].Value).ToUpperInvariant();
        }

        var parsed = new ParsedForm
        {
            ActionUrl = ResolveActionUrl(pageUrl, action),
            Method = string.IsNullOrWhiteSpace(method) ? "POST" : method,
        };

        foreach (Match input in InputTagRegex.Matches(formSegment))
        {
            var attrs = input.Groups[1].Value;
            var name = ReadAttr(NameAttrRegex, attrs);
            if (string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            var type = (ReadAttr(TypeAttrRegex, attrs) ?? "text").ToLowerInvariant();
            if (type is "submit" or "button" or "image")
            {
                continue;
            }

            if (type == "file")
            {
                parsed.FileFieldNames.Add(name);
                continue;
            }

            parsed.Fields[name] = ReadAttr(ValueAttrRegex, attrs) ?? string.Empty;
        }

        foreach (Match textarea in TextareaTagRegex.Matches(formSegment))
        {
            var attrs = textarea.Groups[1].Value;
            var name = ReadAttr(NameAttrRegex, attrs);
            var id = ReadAttr(IdAttrRegex, attrs);
            if (string.IsNullOrWhiteSpace(name)
                && string.Equals(id, DetailTextareaId, StringComparison.OrdinalIgnoreCase))
            {
                name = DetailFieldName;
            }

            if (string.IsNullOrWhiteSpace(name))
            {
                continue;
            }

            parsed.Fields[name] = DecodeTextareaInner(textarea.Groups[2].Value);
        }

        if (!parsed.Fields.ContainsKey(DetailFieldName))
        {
            error = $"Detail field '{DetailFieldName}' not found on edit page.";
            return false;
        }

        form = parsed;
        return true;
    }

    public static JArray ExtractSubmitControls(string html)
    {
        var result = new JArray();
        foreach (Match input in InputTagRegex.Matches(html))
        {
            var attrs = input.Groups[1].Value;
            var type = (ReadAttr(TypeAttrRegex, attrs) ?? "text").ToLowerInvariant();
            if (type is not ("submit" or "button" or "image"))
            {
                continue;
            }

            result.Add(new JObject
            {
                ["tag"] = "input",
                ["type"] = type,
                ["name"] = ReadAttr(NameAttrRegex, attrs),
                ["value"] = ReadAttr(ValueAttrRegex, attrs),
            });
        }

        foreach (Match button in Regex.Matches(
                     html,
                     @"<button\b([^>]*)>([\s\S]*?)</button>",
                     RegexOptions.IgnoreCase | RegexOptions.CultureInvariant))
        {
            var attrs = button.Groups[1].Value;
            var type = (ReadAttr(TypeAttrRegex, attrs) ?? "submit").ToLowerInvariant();
            if (type is "button" or "submit")
            {
                result.Add(new JObject
                {
                    ["tag"] = "button",
                    ["type"] = type,
                    ["name"] = ReadAttr(NameAttrRegex, attrs),
                    ["value"] = ReadAttr(ValueAttrRegex, attrs),
                    ["text"] = WebUtility.HtmlDecode(button.Groups[2].Value.Trim()),
                });
            }
        }

        return result;
    }

    public static string BuildUrlEncodedBody(IReadOnlyDictionary<string, string> fields)
    {
        var builder = new StringBuilder();
        var first = true;
        foreach (var pair in fields)
        {
            if (!first)
            {
                builder.Append('&');
            }

            first = false;
            builder.Append(WebUtility.UrlEncode(pair.Key));
            builder.Append('=');
            builder.Append(WebUtility.UrlEncode(pair.Value ?? string.Empty));
        }

        return builder.ToString();
    }

    public static (byte[] Body, string Boundary) BuildMultipartBody(ParsedForm form)
    {
        var boundary = "----qkrpcFormBoundary" + Guid.NewGuid().ToString("N");
        var builder = new StringBuilder();

        void AppendField(string name, string value)
        {
            builder.Append("--").Append(boundary).Append("\r\n");
            builder.Append("Content-Disposition: form-data; name=\"").Append(name).Append("\"\r\n");
            builder.Append("\r\n");
            builder.Append(value ?? string.Empty).Append("\r\n");
        }

        void AppendEmptyFile(string name)
        {
            builder.Append("--").Append(boundary).Append("\r\n");
            builder.Append("Content-Disposition: form-data; name=\"").Append(name).Append("\"; filename=\"\"\r\n");
            builder.Append("Content-Type: application/octet-stream\r\n");
            builder.Append("\r\n");
            builder.Append("\r\n");
        }

        foreach (var pair in form.Fields)
        {
            AppendField(pair.Key, pair.Value);
        }

        foreach (var fileName in form.FileFieldNames)
        {
            AppendEmptyFile(fileName);
        }

        builder.Append("--").Append(boundary).Append("--\r\n");
        return (Encoding.UTF8.GetBytes(builder.ToString()), boundary);
    }

    private static string? ExtractFormSegment(string html, int formStartIndex)
    {
        var segmentEnd = html.IndexOf("</form>", formStartIndex, StringComparison.OrdinalIgnoreCase);
        if (segmentEnd < 0)
        {
            return null;
        }

        return html.Substring(formStartIndex, segmentEnd - formStartIndex);
    }

    private static string ResolveActionUrl(string pageUrl, string action)
    {
        if (string.IsNullOrWhiteSpace(action))
        {
            return pageUrl;
        }

        if (Uri.TryCreate(action, UriKind.Absolute, out var absolute))
        {
            return absolute.ToString();
        }

        if (!Uri.TryCreate(pageUrl, UriKind.Absolute, out var baseUri))
        {
            return action;
        }

        return new Uri(baseUri, action).ToString();
    }

    private static string? ReadAttr(Regex regex, string attrs)
    {
        var match = regex.Match(attrs);
        if (!match.Success)
        {
            return null;
        }

        if (match.Groups[2].Success)
        {
            return WebUtility.HtmlDecode(match.Groups[2].Value);
        }

        if (match.Groups[3].Success)
        {
            return WebUtility.HtmlDecode(match.Groups[3].Value);
        }

        return match.Groups[4].Success
            ? WebUtility.HtmlDecode(match.Groups[4].Value)
            : null;
    }

    private static string DecodeTextareaInner(string raw) =>
        WebUtility.HtmlDecode(raw ?? string.Empty);
}
