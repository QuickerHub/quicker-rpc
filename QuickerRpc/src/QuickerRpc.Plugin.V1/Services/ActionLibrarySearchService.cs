using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Parses getquicker.net /Search HTML for public shared actions (agent learning).
/// </summary>
internal static class ActionLibrarySearchService
{
    private const string SearchBase = "https://getquicker.net/Search";
    private const int MaxLimit = 20;

    private static readonly HttpClient Http = CreateHttpClient();

    private static readonly Regex TotalCountRegex = new(
        @"共找到\s*(\d+)\s*个结果",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex ObjectLinkRegex = new(
        @"<a[^>]*class=""object-link[^""]*""[^>]*href=""([^""]+)""[^>]*>([\s\S]*?)</a>",
        RegexOptions.Compiled | RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);

    private static readonly Regex AuthorRegex = new(
        @"<a class=""user-link[^""]*""[^>]*>([^<]+)</a>",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex UpdatedAtRegex = new(
        @"far fa-history[\s\S]*?(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex LikesRegex = new(
        @"title=""点赞""[\s\S]*?>(\d+)<",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex SnippetRegex = new(
        @"<div class=""font14 text-black-50""[^>]*>([\s\S]*?)</div>",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    private static readonly Regex AppBadgeRegex = new(
        @"badge badge-info[^>]*>([^<]+)<",
        RegexOptions.Compiled | RegexOptions.CultureInvariant);

    public static async Task<QuickerRpcSearchActionLibraryResult> SearchAsync(
        string keyword,
        int page,
        int? days,
        int maxResults,
        CancellationToken cancellationToken = default)
    {
        var key = (keyword ?? string.Empty).Trim();
        if (key.Length == 0)
        {
            return Fail("keyword is required.");
        }

        var safePage = page < 1 ? 1 : page;
        var limit = maxResults < 1 ? 1 : Math.Min(maxResults, MaxLimit);
        var url = BuildSearchUrl(key, safePage, days);

        string html;
        try
        {
            using var response = await Http.GetAsync(url, cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                return Fail($"HTTP {(int)response.StatusCode} for library search.");
            }

            html = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            return Fail("Library search request failed: " + ex.Message);
        }

        var parsed = ParseSearchHtml(html, limit);
        return new QuickerRpcSearchActionLibraryResult
        {
            Success = true,
            Keyword = key,
            Page = safePage,
            Days = days,
            TotalCount = parsed.TotalCount,
            MatchCount = parsed.Items.Count,
            SearchUrl = url,
            Items = parsed.Items,
        };
    }

    private static string BuildSearchUrl(string keyword, int page, int? days)
    {
        var url = $"{SearchBase}?keyword={Uri.EscapeDataString(keyword)}&t=SharedAction&p={page}";
        if (days is > 0)
        {
            url += $"&ud={days.Value}";
        }

        return url;
    }

    internal static (int? TotalCount, IList<QuickerRpcActionLibrarySearchItem> Items) ParseSearchHtml(
        string html,
        int limit)
    {
        int? totalCount = null;
        var totalMatch = TotalCountRegex.Match(html);
        if (totalMatch.Success && int.TryParse(totalMatch.Groups[1].Value, out var total))
        {
            totalCount = total;
        }

        var items = new List<QuickerRpcActionLibrarySearchItem>();
        const string blockStart = "<div class=\"result-item d-flex \">";
        var blocks = html.Split(new[] { blockStart }, StringSplitOptions.None);
        for (var i = 1; i < blocks.Length && items.Count < limit; i++)
        {
            var block = blocks[i];
            var endMarker = "</div>\n                            <div class=\"result-item";
            var end = block.IndexOf(endMarker, StringComparison.Ordinal);
            var chunk = end > 0 ? block[..end] : block.Length > 4000 ? block[..4000] : block;

            var linkMatch = ObjectLinkRegex.Match(chunk);
            if (!linkMatch.Success)
            {
                continue;
            }

            var href = linkMatch.Groups[1].Value.Replace("&amp;", "&");
            var title = StripTags(linkMatch.Groups[2].Value);
            var redirect = ParseRedirect(href);
            if (!string.Equals(redirect.Type, "SharedAction", StringComparison.OrdinalIgnoreCase)
                || string.IsNullOrWhiteSpace(redirect.Id))
            {
                continue;
            }

            var authorMatch = AuthorRegex.Match(chunk);
            var dateMatch = UpdatedAtRegex.Match(chunk);
            var likesMatch = LikesRegex.Match(chunk);
            var snippetMatch = SnippetRegex.Match(chunk);

            int? likes = null;
            if (likesMatch.Success && int.TryParse(likesMatch.Groups[1].Value, out var likeCount))
            {
                likes = likeCount;
            }

            var apps = new List<string>();
            foreach (Match appMatch in AppBadgeRegex.Matches(chunk))
            {
                var app = appMatch.Groups[1].Value.Trim();
                if (app.Length > 0)
                {
                    apps.Add(app);
                }
            }

            items.Add(new QuickerRpcActionLibrarySearchItem
            {
                SharedActionId = redirect.Id,
                Title = title,
                Snippet = snippetMatch.Success ? StripTags(snippetMatch.Groups[1].Value) : null,
                Author = authorMatch.Success ? authorMatch.Groups[1].Value.Trim() : null,
                UpdatedAt = dateMatch.Success ? dateMatch.Groups[1].Value.Trim() : null,
                Likes = likes,
                Apps = apps,
                PageUrl = $"https://getquicker.net/Sharedaction?code={redirect.Id}",
            });
        }

        return (totalCount, items);
    }

    private static (string Type, string Id) ParseRedirect(string href)
    {
        try
        {
            var uri = new Uri(href, UriKind.RelativeOrAbsolute);
            if (!uri.IsAbsoluteUri)
            {
                uri = new Uri(new Uri("https://getquicker.net"), href);
            }

            return (GetQueryParam(uri.Query, "type") ?? string.Empty, GetQueryParam(uri.Query, "id") ?? string.Empty);
        }
        catch
        {
            return (string.Empty, string.Empty);
        }
    }

    private static string? GetQueryParam(string query, string name)
    {
        var trimmed = (query ?? string.Empty).TrimStart('?');
        if (trimmed.Length == 0)
        {
            return null;
        }

        foreach (var part in trimmed.Split('&'))
        {
            var eq = part.IndexOf('=');
            if (eq <= 0)
            {
                continue;
            }

            var key = Uri.UnescapeDataString(part[..eq]);
            if (!string.Equals(key, name, StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            return Uri.UnescapeDataString(part[(eq + 1)..]);
        }

        return null;
    }

    private static string StripTags(string html) =>
        Regex.Replace(
                Regex.Replace(html, @"</?em>", string.Empty, RegexOptions.IgnoreCase),
                @"<[^>]+>",
                " ")
            .Replace("  ", " ")
            .Trim();

    private static QuickerRpcSearchActionLibraryResult Fail(string message) =>
        new() { Success = false, ErrorMessage = message };

    private static HttpClient CreateHttpClient()
    {
        var client = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(30),
        };
        client.DefaultRequestHeaders.TryAddWithoutValidation(
            "User-Agent",
            "quicker-rpc/1.0 (+https://github.com/QuickerHub/quicker-rpc)");
        client.DefaultRequestHeaders.TryAddWithoutValidation("Accept", "text/html");
        return client;
    }
}
