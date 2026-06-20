using System;
using System.IO;
using System.Text.Json;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console;

internal static partial class Program
{
    private static async Task<int> RunActionSharedInfoGetAsync(ActionOptions options)
    {
        var id = ResolveActionSharedInfoId(options);
        if (string.IsNullOrWhiteSpace(id))
        {
            await EmitErrorAsync(options.Json, "MISSING_ACTION_ID", "--id or --code is required.").ConfigureAwait(false);
            return ExitCodes.Error;
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy
                .GetSharedActionDetailHtmlAsync(id, rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(new
                {
                    ok = result.Ok,
                    action = "shared-info-get",
                    sharedId = result.SharedActionId ?? id,
                    html = result.Html,
                    message = result.Message,
                }));
            }
            else if (result.Ok && !string.IsNullOrEmpty(result.Html))
            {
                global::System.Console.Write(result.Html);
            }
            else
            {
                global::System.Console.Error.WriteLine(result.Message);
            }

            return result.Ok ? ExitCodes.Success : ExitCodes.Error;
        }
        catch (Exception ex)
        {
            await EmitErrorAsync(options.Json, "ACTION_SHARED_INFO_GET_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }

    private static async Task<int> RunActionSharedInfoSetAsync(ActionOptions options)
    {
        var id = ResolveActionSharedInfoId(options);
        if (string.IsNullOrWhiteSpace(id))
        {
            await EmitErrorAsync(options.Json, "MISSING_ACTION_ID", "--id or --code is required.").ConfigureAwait(false);
            return ExitCodes.Error;
        }

        var html = options.Html;
        if (string.IsNullOrWhiteSpace(html) && !string.IsNullOrWhiteSpace(options.HtmlFile))
        {
            html = await File.ReadAllTextAsync(options.HtmlFile).ConfigureAwait(false);
        }

        if (string.IsNullOrWhiteSpace(html))
        {
            await EmitErrorAsync(options.Json, "MISSING_HTML", "--html or --html-file is required.").ConfigureAwait(false);
            return ExitCodes.Error;
        }

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy
                .SetSharedActionDetailHtmlAsync(id, html, rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(new
                {
                    ok = result.Ok,
                    action = "shared-info-set",
                    sharedId = result.SharedActionId ?? id,
                    message = result.Message,
                }));
            }
            else
            {
                global::System.Console.WriteLine(result.Message);
            }

            return result.Ok ? ExitCodes.Success : ExitCodes.Error;
        }
        catch (Exception ex)
        {
            await EmitErrorAsync(options.Json, "ACTION_SHARED_INFO_SET_FAILED", ex.Message).ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }

    private static async Task<int> RunActionSharedInfoSubmitReviewAsync(ActionOptions options)
    {
        var id = ResolveActionSharedInfoId(options);
        if (string.IsNullOrWhiteSpace(id))
        {
            await EmitErrorAsync(options.Json, "MISSING_ACTION_ID", "--id or --code is required.").ConfigureAwait(false);
            return ExitCodes.Error;
        }

        var (noteOk, _, noteErrorCode, noteErrorMessage) = ResolveShareNote(options);
        if (!noteOk)
        {
            await EmitErrorAsync(options.Json, noteErrorCode!, noteErrorMessage!).ConfigureAwait(false);
            return ExitCodes.Error;
        }

        var (htmlOk, detailHtml, htmlErrorCode, htmlErrorMessage) = await ResolveDetailHtmlAsync(options)
            .ConfigureAwait(false);
        if (!htmlOk)
        {
            await EmitErrorAsync(options.Json, htmlErrorCode!, htmlErrorMessage!).ConfigureAwait(false);
            return ExitCodes.Error;
        }

        var introHtml = ActionPublishIntro.ResolveDetailHtml(detailHtml);

        try
        {
            await using var session = await ConnectAsync(options.TimeoutSeconds, !options.NoBootstrap).ConfigureAwait(false);
            var rpcToken = QuickerRpcConnect.CreateRpcCancellationToken(options.TimeoutSeconds);
            var result = await session.Proxy
                .SubmitSharedActionForReviewAsync(id, introHtml, rpcToken)
                .ConfigureAwait(false);

            if (options.Json)
            {
                global::System.Console.WriteLine(JsonSerializer.Serialize(new
                {
                    ok = result.Ok,
                    action = "shared-info-submit-review",
                    sharedId = result.SharedActionId ?? id,
                    message = result.Message,
                }));
            }
            else
            {
                global::System.Console.WriteLine(result.Message);
            }

            return result.Ok ? ExitCodes.Success : ExitCodes.Error;
        }
        catch (Exception ex)
        {
            await EmitErrorAsync(options.Json, "ACTION_SHARED_INFO_SUBMIT_REVIEW_FAILED", ex.Message)
                .ConfigureAwait(false);
            return ExitCodes.Error;
        }
    }

    private static string? ResolveActionSharedInfoId(ActionOptions options) =>
        string.IsNullOrWhiteSpace(options.Id)
            ? options.Code?.Trim()
            : options.Id.Trim();
}
