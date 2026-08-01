using System.Net.Http;
using System.Net.Http.Headers;
using Newtonsoft.Json.Linq;
using QuickerRpc.Contracts.Rpc;
using QuickerRpc.Host;
using QuickerRpc.Plugin.Services;
using QuickerRpc.Plugin.V2.Reflection;

namespace QuickerRpc.Plugin.V2.Adapters;

internal sealed class V2ActionDocHost : IQuickerRpcActionDocHost
{
    private const string GetTempTokenApiUrl = "https://api.getquicker.net/api/Account/GetTempToken";

    public Task<QuickerRpcActionDocResult> GetDetailHtmlAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default) =>
        RunAsync(idOrSharedId, readHtml: true, htmlToWrite: null, submitForReview: false, cancellationToken);

    public Task<QuickerRpcActionDocResult> SetDetailHtmlAsync(
        string idOrSharedId,
        string htmlContent,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(htmlContent))
        {
            return Task.FromResult(Fail(idOrSharedId, "html content is required."));
        }

        return RunAsync(idOrSharedId, readHtml: false, htmlContent, submitForReview: false, cancellationToken);
    }

    public Task<QuickerRpcActionDocResult> SubmitForReviewAsync(
        string idOrSharedId,
        string? htmlContent = null,
        CancellationToken cancellationToken = default) =>
        RunAsync(idOrSharedId, readHtml: false, htmlContent, submitForReview: true, cancellationToken);

    public async Task<string> ProbeDetailApisAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!TryResolveSharedActionId(idOrSharedId, out var sharedId, out var error))
        {
            return new JObject { ["ok"] = false, ["message"] = error }.ToString();
        }

        var token = QuickerV2AccountAccessor.TryGetBearerToken();
        if (string.IsNullOrEmpty(token))
        {
            return new JObject { ["ok"] = false, ["message"] = "Bearer token unavailable." }.ToString();
        }

        var result = await ActionDocApiProbe
            .ProbeAsync(sharedId, token, cancellationToken, GetTempTokenAsync)
            .ConfigureAwait(false);
        result["ok"] = true;
        return result.ToString(Newtonsoft.Json.Formatting.None);
    }

    public async Task<QuickerRpcSharedInfoWebSessionResult> PrepareWebSessionAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!TryResolveSharedActionId(idOrSharedId, out var sharedId, out var error))
        {
            return new QuickerRpcSharedInfoWebSessionResult
            {
                Ok = false,
                SharedActionId = idOrSharedId,
                Message = error ?? "Could not resolve shared action id.",
            };
        }

        var (ok, message, tempToken) = await GetTempTokenAsync(cancellationToken).ConfigureAwait(false);
        return new QuickerRpcSharedInfoWebSessionResult
        {
            Ok = ok,
            SharedActionId = sharedId,
            TempToken = tempToken,
            Message = ok ? "Web session prepared." : message ?? "Web session unavailable.",
        };
    }

    private static async Task<QuickerRpcActionDocResult> RunAsync(
        string idOrSharedId,
        bool readHtml,
        string? htmlToWrite,
        bool submitForReview,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!TryResolveSharedActionId(idOrSharedId, out var sharedId, out var resolveError))
        {
            return Fail(idOrSharedId, resolveError ?? "Could not resolve shared action id.");
        }

        try
        {
            var (tokenOk, tokenMessage, tempToken) = await GetTempTokenAsync(cancellationToken).ConfigureAwait(false);
            if (!tokenOk || string.IsNullOrEmpty(tempToken))
            {
                return Fail(sharedId, tokenMessage ?? "Quicker web auto-login is unavailable.");
            }

            using var http = new ActionDocHttpClient();
            if (readHtml)
            {
                var (ok, message, html) = await http
                    .GetDetailHtmlAsync(sharedId, tempToken, cancellationToken)
                    .ConfigureAwait(false);
                return ok
                    ? new QuickerRpcActionDocResult
                    {
                        Ok = true,
                        SharedActionId = sharedId,
                        Html = html,
                        Message = "Read action page intro HTML.",
                    }
                    : Fail(sharedId, message ?? "Failed to read action page HTML.");
            }

            var (setOk, setMessage) = await http
                .SubmitEditFormAsync(sharedId, tempToken, htmlToWrite, submitForReview, cancellationToken)
                .ConfigureAwait(false);
            return setOk
                ? new QuickerRpcActionDocResult
                {
                    Ok = true,
                    SharedActionId = sharedId,
                    Message = setMessage ?? (submitForReview
                        ? "Shared action submitted for library review."
                        : "Action page intro updated."),
                }
                : Fail(sharedId, setMessage ?? "Failed to submit action edit form.");
        }
        catch (Exception ex)
        {
            return Fail(sharedId, ex.Message);
        }
    }

    private static async Task<(bool Ok, string? Message, string? Token)> GetTempTokenAsync(
        CancellationToken cancellationToken)
    {
        var bearerToken = QuickerV2AccountAccessor.TryGetBearerToken();
        if (string.IsNullOrEmpty(bearerToken))
        {
            return (false, QuickerV2Runtime.IsRunningInQuicker
                ? "Quicker bearer token unavailable. Ensure Quicker is logged in."
                : "Not running inside Quicker.", null);
        }

        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", bearerToken);
        client.DefaultRequestHeaders.CacheControl = new CacheControlHeaderValue { NoCache = true };
        using var response = await client
            .GetAsync($"{GetTempTokenApiUrl}?tick={DateTime.Now.Ticks}", cancellationToken)
            .ConfigureAwait(false);
        if (!response.IsSuccessStatusCode)
        {
            return (false, $"GetTempToken API failed: {(int)response.StatusCode}", null);
        }

        var json = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var root = JObject.Parse(json);
            var token = root["Data"]?.Value<string>()?.Trim();
            var ok = root["IsSuccess"]?.Value<bool>() == true && !string.IsNullOrEmpty(token);
            return (ok, root["Message"]?.Value<string>() ?? (ok ? null : "GetTempToken API call failed."), token);
        }
        catch (Exception ex)
        {
            return (false, "GetTempToken API returned invalid JSON: " + ex.Message, null);
        }
    }

    private static bool TryResolveSharedActionId(string? idOrSharedId, out string sharedId, out string? error)
    {
        sharedId = (idOrSharedId ?? string.Empty).Trim();
        error = null;
        if (sharedId.Length == 0)
        {
            error = "id is required.";
            return false;
        }

        var accessor = QuickerV2ActionAccessor.Current;
        if (accessor is not null && accessor.TryGetById(sharedId, out var action, out _) && action is not null)
        {
            var resolved = accessor.GetSharedActionId(action)?.Trim();
            if (string.IsNullOrEmpty(resolved))
            {
                error = "Local action is not shared yet. Publish first (Pub3).";
                return false;
            }

            sharedId = resolved;
            return true;
        }

        if (Guid.TryParse(sharedId, out _))
        {
            return true;
        }

        error = "id must be a local shared action or a sharedActionId GUID.";
        return false;
    }

    private static QuickerRpcActionDocResult Fail(string? sharedId, string message) =>
        new()
        {
            Ok = false,
            SharedActionId = sharedId,
            Message = message,
        };
}
