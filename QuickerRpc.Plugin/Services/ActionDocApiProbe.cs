using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

namespace QuickerRpc.Plugin.Services;

/// <summary>Live probe for getquicker shared-action Detail APIs (research / diagnostics).</summary>
internal static class ActionDocApiProbe
{
    private const string ApiBase = "https://api.getquicker.net/api";

    public static async Task<JObject> ProbeAsync(
        string sharedActionId,
        string bearerToken,
        CancellationToken cancellationToken = default)
    {
        using var client = CreateApiClient(bearerToken);
        var sharedId = sharedActionId.Trim();
        var probes = new JArray();

        await ProbeGetAsync(
                client,
                probes,
                "profiles.GetUserSharedAction",
                $"{ApiBase}/profiles/GetUserSharedAction?tick={DateTime.Now.Ticks}&actionId={Uri.EscapeDataString(sharedId)}",
                cancellationToken)
            .ConfigureAwait(false);

        await ProbeGetAsync(
                client,
                probes,
                "SharedAction.Download",
                $"{ApiBase}/SharedAction/Download?id={sharedId}&revision=&softVersion=1.45.5.0&forPreview=true",
                cancellationToken)
            .ConfigureAwait(false);

        await ProbePostJsonAsync(
                client,
                probes,
                "sharedaction.GetDetail.guess",
                $"{ApiBase}/sharedaction/GetDetail",
                new JObject { ["id"] = sharedId },
                cancellationToken)
            .ConfigureAwait(false);

        await ProbePostJsonAsync(
                client,
                probes,
                "SharedAction.SaveDetail.guess",
                $"{ApiBase}/SharedAction/SaveDetail",
                new JObject { ["sharedActionId"] = sharedId, ["detail"] = "<p>probe</p>" },
                cancellationToken)
            .ConfigureAwait(false);

        await ProbePostJsonAsync(
                client,
                probes,
                "profiles.UpdateActionDetail.guess",
                $"{ApiBase}/profiles/UpdateActionDetail",
                new JObject { ["id"] = sharedId, ["detail"] = "<p>probe</p>" },
                cancellationToken)
            .ConfigureAwait(false);

        var formProbe = await ProbeEditFormAsync(sharedId, cancellationToken).ConfigureAwait(false);

        return new JObject
        {
            ["sharedId"] = sharedId,
            ["hasBearerToken"] = !string.IsNullOrWhiteSpace(bearerToken),
            ["apiProbes"] = probes,
            ["editForm"] = formProbe,
        };
    }

    private static HttpClient CreateApiClient(string bearerToken)
    {
        var client = new HttpClient
        {
            Timeout = TimeSpan.FromSeconds(30),
        };
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", bearerToken);
        client.DefaultRequestHeaders.CacheControl = new CacheControlHeaderValue { NoCache = true };
        return client;
    }

    private static async Task ProbeGetAsync(
        HttpClient client,
        JArray probes,
        string name,
        string url,
        CancellationToken cancellationToken)
    {
        try
        {
            using var response = await client.GetAsync(new Uri(url), cancellationToken).ConfigureAwait(false);
            var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            probes.Add(BuildProbeResult(name, "GET", url, (int)response.StatusCode, body));
        }
        catch (Exception ex)
        {
            probes.Add(new JObject
            {
                ["name"] = name,
                ["method"] = "GET",
                ["url"] = url,
                ["error"] = ex.Message,
            });
        }
    }

    private static async Task ProbePostJsonAsync(
        HttpClient client,
        JArray probes,
        string name,
        string url,
        JObject payload,
        CancellationToken cancellationToken)
    {
        try
        {
            using var content = new StringContent(payload.ToString(), Encoding.UTF8, "application/json");
            using var response = await client.PostAsync(new Uri(url), content, cancellationToken).ConfigureAwait(false);
            var body = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            probes.Add(BuildProbeResult(name, "POST", url, (int)response.StatusCode, body));
        }
        catch (Exception ex)
        {
            probes.Add(new JObject
            {
                ["name"] = name,
                ["method"] = "POST",
                ["url"] = url,
                ["error"] = ex.Message,
            });
        }
    }

    private static JObject BuildProbeResult(string name, string method, string url, int statusCode, string body)
    {
        var trimmed = body?.Length > 600 ? body[..600] + "…" : body;
        JObject? json = null;
        string[]? topLevelKeys = null;
        bool? isSuccess = null;
        string? message = null;

        if (!string.IsNullOrWhiteSpace(body))
        {
            try
            {
                json = JObject.Parse(body);
                topLevelKeys = json.Properties().Select(p => p.Name).ToArray();
                if (json["IsSuccess"]?.Type == JTokenType.Boolean)
                {
                    isSuccess = json["IsSuccess"]!.Value<bool>();
                }

                message = json["Message"]?.Type == JTokenType.String
                    ? json["Message"]!.Value<string>()
                    : null;
            }
            catch
            {
                // Non-JSON body.
            }
        }

        var dataKeys = json?["Data"] is JObject dataObj
            ? dataObj.Properties().Select(p => p.Name).ToArray()
            : null;

        return new JObject
        {
            ["name"] = name,
            ["method"] = method,
            ["url"] = url,
            ["statusCode"] = statusCode,
            ["isSuccess"] = isSuccess,
            ["message"] = message,
            ["topLevelKeys"] = topLevelKeys is null ? null : JArray.FromObject(topLevelKeys),
            ["dataKeys"] = dataKeys is null ? null : JArray.FromObject(dataKeys),
            ["bodyPreview"] = trimmed,
        };
    }

    private static async Task<JObject> ProbeEditFormAsync(string sharedId, CancellationToken cancellationToken)
    {
        var (tokenOk, tokenMessage, tempToken) = await WebConnectorTempTokenAccessor.GetTempTokenAsync()
            .ConfigureAwait(false);
        if (!tokenOk || string.IsNullOrEmpty(tempToken))
        {
            return new JObject
            {
                ["ok"] = false,
                ["message"] = tokenMessage ?? "temp token unavailable",
            };
        }

        using var http = new ActionDocHttpClient();
        var (pageOk, pageMessage, finalUrl, pageHtml) = await http
            .FetchEditPageAsync(sharedId, tempToken, cancellationToken)
            .ConfigureAwait(false);

        if (!pageOk || string.IsNullOrEmpty(pageHtml))
        {
            return new JObject
            {
                ["ok"] = false,
                ["message"] = pageMessage,
            };
        }

        if (!ActionDocFormParser.TryParse(pageHtml, finalUrl ?? string.Empty, out var form, out var parseError)
            || form is null)
        {
            return new JObject
            {
                ["ok"] = false,
                ["message"] = parseError,
            };
        }

        string? htmlDumpPath = null;
        try
        {
            htmlDumpPath = System.IO.Path.Combine(
                System.IO.Path.GetTempPath(),
                $"qkrpc-edit-page-{sharedId}.html");
            System.IO.File.WriteAllText(htmlDumpPath, pageHtml, Encoding.UTF8);
        }
        catch
        {
            htmlDumpPath = null;
        }

        var submitControls = ActionDocFormParser.ExtractSubmitControls(pageHtml);
        return new JObject
        {
            ["ok"] = true,
            ["htmlDumpPath"] = htmlDumpPath,
            ["finalUrl"] = finalUrl,
            ["formAction"] = form.ActionUrl,
            ["formMethod"] = form.Method,
            ["fieldCount"] = form.Fields.Count,
            ["fieldNames"] = JArray.FromObject(form.Fields.Keys.OrderBy(k => k, StringComparer.Ordinal).ToArray()),
            ["detailFieldPresent"] = form.Fields.ContainsKey(ActionDocFormParser.DetailFieldName),
            ["submitControls"] = submitControls,
        };
    }
}
