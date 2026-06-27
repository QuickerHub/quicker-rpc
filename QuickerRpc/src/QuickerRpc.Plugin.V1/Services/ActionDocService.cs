using System;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using Quicker.Common;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Plugin.Services;

/// <summary>
/// Built-in sync for getquicker shared-action HTML intro (动作说明).
/// Uses Quicker temp-token web login and HTTP form submit on Member/Action/Edit (no browser automation).
/// </summary>
public sealed class ActionDocService
{
    public async Task<QuickerRpcActionDocResult> GetDetailHtmlAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default)
    {
        return await RunAsync(idOrSharedId, readHtml: true, htmlToWrite: null, cancellationToken)
            .ConfigureAwait(false);
    }

    public async Task<string> ProbeApisAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var id = (idOrSharedId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return new JObject { ["ok"] = false, ["message"] = "id is required." }.ToString();
        }

        if (!TryResolveSharedActionId(id, out var sharedId, out var resolveError))
        {
            return new JObject { ["ok"] = false, ["message"] = resolveError }.ToString();
        }

        var bearerToken = QuickerAccountAccessor.TryGetBearerToken();
        if (string.IsNullOrEmpty(bearerToken))
        {
            return new JObject { ["ok"] = false, ["message"] = "Bearer token unavailable." }.ToString();
        }

        var result = await ActionDocApiProbe
            .ProbeAsync(sharedId, bearerToken, cancellationToken)
            .ConfigureAwait(false);
        result["ok"] = true;
        return result.ToString(Newtonsoft.Json.Formatting.None);
    }

    public async Task<QuickerRpcSharedInfoWebSessionResult> PrepareWebSessionAsync(
        string idOrSharedId,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var id = (idOrSharedId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return new QuickerRpcSharedInfoWebSessionResult
            {
                Ok = false,
                Message = "id is required.",
            };
        }

        if (!TryResolveSharedActionId(id, out var sharedId, out var resolveError))
        {
            return new QuickerRpcSharedInfoWebSessionResult
            {
                Ok = false,
                SharedActionId = id,
                Message = resolveError ?? "Could not resolve shared action id.",
            };
        }

        try
        {
            return await Task.Run(
                    async () =>
                    {
                        var (tokenOk, tokenMessage, tempToken) =
                            await WebConnectorTempTokenAccessor.GetTempTokenAsync().ConfigureAwait(false);
                        if (!tokenOk || string.IsNullOrEmpty(tempToken))
                        {
                            return new QuickerRpcSharedInfoWebSessionResult
                            {
                                Ok = false,
                                SharedActionId = sharedId,
                                Message = string.IsNullOrWhiteSpace(tokenMessage)
                                    ? "Quicker web auto-login is unavailable. Ensure Quicker is logged in."
                                    : tokenMessage,
                            };
                        }

                        return new QuickerRpcSharedInfoWebSessionResult
                        {
                            Ok = true,
                            SharedActionId = sharedId,
                            TempToken = tempToken,
                            Message = "Web session prepared.",
                        };
                    },
                    cancellationToken)
                .ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            return new QuickerRpcSharedInfoWebSessionResult
            {
                Ok = false,
                SharedActionId = sharedId,
                Message = ex.Message,
            };
        }
    }

    public async Task<QuickerRpcActionDocResult> SetDetailHtmlAsync(
        string idOrSharedId,
        string htmlContent,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(htmlContent))
        {
            return Fail(idOrSharedId, "html content is required.");
        }

        return await RunAsync(idOrSharedId, readHtml: false, htmlToWrite: htmlContent, cancellationToken)
            .ConfigureAwait(false);
    }

    /// <summary>
    /// Saves the edit form (optionally writing Detail HTML first) and submits the shared action for
    /// library review — the web page 保存并发布到动作库 button (Edit?handler=Publish).
    /// </summary>
    public async Task<QuickerRpcActionDocResult> SubmitForReviewAsync(
        string idOrSharedId,
        string? htmlToWrite = null,
        CancellationToken cancellationToken = default)
    {
        return await RunAsync(
                idOrSharedId,
                readHtml: false,
                htmlToWrite,
                cancellationToken,
                submitForReview: true)
            .ConfigureAwait(false);
    }

    private static async Task<QuickerRpcActionDocResult> RunAsync(
        string idOrSharedId,
        bool readHtml,
        string? htmlToWrite,
        CancellationToken cancellationToken,
        bool submitForReview = false)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var id = (idOrSharedId ?? string.Empty).Trim();
        if (id.Length == 0)
        {
            return Fail(null, "id is required.");
        }

        if (!TryResolveSharedActionId(id, out var sharedId, out var resolveError))
        {
            return Fail(id, resolveError ?? "Could not resolve shared action id.");
        }

        try
        {
            return await Task.Run(
                    async () =>
                    {
                        var (tokenOk, tokenMessage, tempToken) =
                            await WebConnectorTempTokenAccessor.GetTempTokenAsync().ConfigureAwait(false);
                        if (!tokenOk || string.IsNullOrEmpty(tempToken))
                        {
                            return Fail(
                                sharedId,
                                string.IsNullOrWhiteSpace(tokenMessage)
                                    ? "Quicker web auto-login is unavailable. Ensure Quicker is logged in."
                                    : tokenMessage);
                        }

                        using var http = new ActionDocHttpClient();
                        if (readHtml)
                        {
                            var (ok, message, html) = await http
                                .GetDetailHtmlAsync(sharedId, tempToken, cancellationToken)
                                .ConfigureAwait(false);
                            if (!ok)
                            {
                                return Fail(sharedId, message ?? "Failed to read action page HTML.");
                            }

                            return new QuickerRpcActionDocResult
                            {
                                Ok = true,
                                SharedActionId = sharedId,
                                Html = html,
                                Message = "Read action page intro HTML.",
                            };
                        }

                        var (setOk, setMessage) = await http
                            .SubmitEditFormAsync(sharedId, tempToken, htmlToWrite, submitForReview, cancellationToken)
                            .ConfigureAwait(false);
                        if (!setOk)
                        {
                            return Fail(sharedId, setMessage ?? "Failed to submit action edit form.");
                        }

                        return new QuickerRpcActionDocResult
                        {
                            Ok = true,
                            SharedActionId = sharedId,
                            Message = setMessage ?? (submitForReview
                                ? "Shared action submitted for library review."
                                : "Action page intro updated."),
                        };
                    },
                    cancellationToken)
                .ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            return Fail(sharedId, ex.Message);
        }
    }

    private static bool TryResolveSharedActionId(
        string id,
        out string sharedId,
        out string? error)
    {
        sharedId = id;
        error = null;

        if (ActionContextResolver.TryResolve(id, out _, out var actionObj, out _))
        {
            if (actionObj is ActionItem action && !string.IsNullOrWhiteSpace(action.SharedActionId))
            {
                sharedId = action.SharedActionId.Trim();
                return true;
            }

            error = "Local action is not shared yet. Publish first (Pub3).";
            return false;
        }

        if (Guid.TryParse(id, out _))
        {
            sharedId = id;
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
