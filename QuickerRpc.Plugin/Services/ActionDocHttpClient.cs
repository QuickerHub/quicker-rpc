using System;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace QuickerRpc.Plugin.Services;

/// <summary>HTTP client for getquicker Member/Action/Edit using temp-token redirect login.</summary>
internal sealed class ActionDocHttpClient : IDisposable
{
    private const string MainSite = "https://getquicker.net";

    private const string EditPagePathTemplate = "/Member/Action/Edit?id={0}";

    private const string RedirectPathTemplate = "/member/redirect?token={0}&go={1}";

    private readonly HttpClient _client;

    public ActionDocHttpClient()
    {
        var handler = new HttpClientHandler
        {
            CookieContainer = new CookieContainer(),
            UseCookies = true,
            AllowAutoRedirect = true,
        };

        if (handler.SupportsAutomaticDecompression)
        {
            handler.AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate;
        }

        _client = new HttpClient(handler)
        {
            Timeout = TimeSpan.FromSeconds(90),
        };

        _client.DefaultRequestHeaders.TryAddWithoutValidation(
            "User-Agent",
            "QuickerRpc-ActionDoc/1.0");
    }

    internal async Task<(bool Ok, string? Message, string? FinalUrl, string? PageHtml)> FetchEditPageAsync(
        string sharedActionId,
        string tempToken,
        CancellationToken cancellationToken)
    {
        var editPath = string.Format(EditPagePathTemplate, sharedActionId.Trim());
        var loginUrl = BuildRedirectUrl(tempToken, editPath);

        using var loginRequest = new HttpRequestMessage(HttpMethod.Get, loginUrl);
        using var loginResponse = await _client
            .SendAsync(loginRequest, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
            .ConfigureAwait(false);

        if (!loginResponse.IsSuccessStatusCode)
        {
            return (false, $"Auto-login redirect failed: {(int)loginResponse.StatusCode}", null, null);
        }

        var finalUrl = loginResponse.RequestMessage?.RequestUri?.ToString() ?? loginUrl;
        var pageHtml = await loginResponse.Content.ReadAsStringAsync().ConfigureAwait(false);
        if (!finalUrl.Contains("/Member/Action/Edit", StringComparison.OrdinalIgnoreCase))
        {
            return (false, "Did not reach action edit page after auto-login.", finalUrl, pageHtml);
        }

        return (true, null, finalUrl, pageHtml);
    }

    public async Task<(bool Ok, string? Message, string? Html)> GetDetailHtmlAsync(
        string sharedActionId,
        string tempToken,
        CancellationToken cancellationToken)
    {
        var (pageOk, pageMessage, finalUrl, pageHtml) = await FetchEditPageAsync(
                sharedActionId,
                tempToken,
                cancellationToken)
            .ConfigureAwait(false);
        if (!pageOk || string.IsNullOrEmpty(pageHtml) || string.IsNullOrEmpty(finalUrl))
        {
            return (false, pageMessage ?? "Failed to load edit page.", null);
        }

        if (!ActionDocFormParser.TryParse(pageHtml, finalUrl, out var form, out var parseError)
            || form is null)
        {
            return (false, parseError ?? "Failed to parse edit form.", null);
        }

        return (true, null, form.DetailHtml);
    }

    public async Task<(bool Ok, string? Message)> SetDetailHtmlAsync(
        string sharedActionId,
        string tempToken,
        string htmlContent,
        CancellationToken cancellationToken)
    {
        if (htmlContent is null)
        {
            throw new ArgumentNullException(nameof(htmlContent));
        }

        var (pageOk, pageMessage, finalUrl, pageHtml) = await FetchEditPageAsync(
                sharedActionId,
                tempToken,
                cancellationToken)
            .ConfigureAwait(false);
        if (!pageOk || string.IsNullOrEmpty(pageHtml) || string.IsNullOrEmpty(finalUrl))
        {
            return (false, pageMessage ?? "Failed to load edit page.");
        }

        if (!ActionDocFormParser.TryParse(pageHtml, finalUrl, out var form, out var parseError)
            || form is null)
        {
            return (false, parseError ?? "Failed to parse edit form.");
        }

        form.Fields[ActionDocFormParser.DetailFieldName] = htmlContent;
        var (body, boundary) = ActionDocFormParser.BuildMultipartBody(form);
        using var postContent = new ByteArrayContent(body);
        postContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("multipart/form-data")
        {
            Parameters = { new System.Net.Http.Headers.NameValueHeaderValue("boundary", boundary) },
        };
        using var postRequest = new HttpRequestMessage(HttpMethod.Post, form.ActionUrl)
        {
            Content = postContent,
        };
        postRequest.Headers.TryAddWithoutValidation("Referer", finalUrl);

        using var postResponse = await _client
            .SendAsync(postRequest, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
            .ConfigureAwait(false);

        var responseUrl = postResponse.RequestMessage?.RequestUri?.ToString() ?? form.ActionUrl;
        if (postResponse.IsSuccessStatusCode
            && !responseUrl.Contains("/Member/Action/Edit", StringComparison.OrdinalIgnoreCase))
        {
            return (true, "Action page intro updated.");
        }

        if (postResponse.IsSuccessStatusCode)
        {
            var responseHtml = await postResponse.Content.ReadAsStringAsync().ConfigureAwait(false);
            if (!responseHtml.Contains(DetailTextareaIdMarker(), StringComparison.OrdinalIgnoreCase))
            {
                return (true, "Action page intro updated.");
            }
        }

        return (false, $"Submit edit form failed: {(int)postResponse.StatusCode}");
    }

    public void Dispose() => _client.Dispose();

    private static string BuildRedirectUrl(string tempToken, string goPath)
    {
        var go = WebUtility.UrlEncode(goPath.StartsWith("/", StringComparison.Ordinal) ? goPath : "/" + goPath);
        return MainSite + string.Format(RedirectPathTemplate, WebUtility.UrlEncode(tempToken), go);
    }

    private static string DetailTextareaIdMarker() => ActionDocFormParser.DetailTextareaId;
}
