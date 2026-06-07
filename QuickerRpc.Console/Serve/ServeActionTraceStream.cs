using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.Serve;

internal sealed class ServeActionTraceStreamRequest
{
    public string? Id { get; set; }

    public string? Param { get; set; }

    public int TimeoutSeconds { get; set; }
}

/// <summary>SSE stream for action trace (dedicated pipe session with client callbacks).</summary>
internal static class ServeActionTraceStream
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    public static Task HandleAsync(
        HttpContext context,
        int defaultTimeoutSeconds,
        bool tryBootstrap,
        CancellationToken cancellationToken) =>
        HandleAsync(context, defaultTimeoutSeconds, tryBootstrap, cancellationToken, request: null);

    public static async Task HandleAsync(
        HttpContext context,
        int defaultTimeoutSeconds,
        bool tryBootstrap,
        CancellationToken cancellationToken,
        ServeActionTraceStreamRequest? request)
    {
        var body = request ?? await ReadRequestAsync(context, cancellationToken).ConfigureAwait(false);
        if (body is null)
        {
            return;
        }

        var actionId = body.Id?.Trim() ?? string.Empty;
        if (actionId.Length == 0)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response
                .WriteAsJsonAsync(new { ok = false, error = "MISSING_ACTION_ID" }, cancellationToken)
                .ConfigureAwait(false);
            return;
        }

        var timeoutSeconds = body.TimeoutSeconds > 0 ? body.TimeoutSeconds : defaultTimeoutSeconds;
        timeoutSeconds = Math.Max(1, timeoutSeconds);

        context.Response.StatusCode = StatusCodes.Status200OK;
        context.Response.ContentType = "text/event-stream; charset=utf-8";
        context.Response.Headers.CacheControl = "no-cache, no-transform";
        context.Response.Headers.Connection = "keep-alive";
        context.Response.Headers["X-Accel-Buffering"] = "no";

        var callbacks = new ServeTraceStreamCallbacks(context.Response, cancellationToken);
        await WriteEventAsync(
                context.Response,
                "start",
                new { actionId, param = body.Param },
                cancellationToken)
            .ConfigureAwait(false);

        try
        {
            await using var session = await QuickerRpcClient
                .ConnectAsync(timeoutSeconds, tryBootstrap, callbacks, cancellationToken)
                .ConfigureAwait(false);

            var rpcToken = QuickerRpcClient.CreateRpcCancellationToken(timeoutSeconds);
            var progress = new Progress<QuickerRpcActionTraceEvent>(evt =>
            {
                _ = callbacks.EmitTraceAsync(evt);
            });
            var result = await session.Rpc
                .RunActionTraceAsync(actionId, body.Param, progress, rpcToken)
                .ConfigureAwait(false);

            if (callbacks.StreamedCount == 0 && result.Events.Count > 0)
            {
                foreach (var traceEvent in result.Events)
                {
                    await callbacks.EmitTraceAsync(traceEvent).ConfigureAwait(false);
                }
            }

            await WriteEventAsync(context.Response, "done", result, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (QuickerRpcClientException ex)
        {
            await WriteEventAsync(
                    context.Response,
                    "error",
                    new { message = ex.Message, code = ex.ErrorCode },
                    cancellationToken)
                .ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            await WriteEventAsync(
                    context.Response,
                    "error",
                    new { message = "trace stream cancelled" },
                    CancellationToken.None)
                .ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            await WriteEventAsync(
                    context.Response,
                    "error",
                    new { message = ex.Message },
                    cancellationToken)
                .ConfigureAwait(false);
        }
    }

    internal static ServeActionTraceStreamRequest? ParseQuery(HttpContext context)
    {
        var actionId = context.Request.Query["id"].ToString().Trim();
        if (actionId.Length == 0)
        {
            return null;
        }

        var timeoutRaw = context.Request.Query["timeoutSeconds"].ToString().Trim();
        var timeoutSeconds = 0;
        if (timeoutRaw.Length > 0 && int.TryParse(timeoutRaw, out var parsed))
        {
            timeoutSeconds = parsed;
        }

        var param = context.Request.Query["param"].ToString();
        return new ServeActionTraceStreamRequest
        {
            Id = actionId,
            Param = string.IsNullOrWhiteSpace(param) ? null : param,
            TimeoutSeconds = timeoutSeconds,
        };
    }

    private static async Task<ServeActionTraceStreamRequest?> ReadRequestAsync(
        HttpContext context,
        CancellationToken cancellationToken)
    {
        if (HttpMethods.IsGet(context.Request.Method))
        {
            var fromQuery = ParseQuery(context);
            if (fromQuery is null)
            {
                context.Response.StatusCode = StatusCodes.Status400BadRequest;
                await context.Response
                    .WriteAsJsonAsync(new { ok = false, error = "MISSING_ACTION_ID" }, cancellationToken)
                    .ConfigureAwait(false);
            }

            return fromQuery;
        }

        ServeActionTraceStreamRequest? body;
        try
        {
            body = await context.Request
                .ReadFromJsonAsync<ServeActionTraceStreamRequest>(JsonOptions, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (JsonException ex)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response
                .WriteAsJsonAsync(new { ok = false, error = "INVALID_JSON", message = ex.Message }, cancellationToken)
                .ConfigureAwait(false);
            return null;
        }

        return body;
    }

    internal static async Task WriteEventAsync(
        HttpResponse response,
        string eventName,
        object data,
        CancellationToken cancellationToken)
    {
        var json = JsonSerializer.Serialize(data, JsonOptions);
        await response.WriteAsync($"event: {eventName}\n", cancellationToken).ConfigureAwait(false);
        await response.WriteAsync($"data: {json}\n\n", cancellationToken).ConfigureAwait(false);
        await response.Body.FlushAsync(cancellationToken).ConfigureAwait(false);
    }

    internal sealed class ServeTraceStreamCallbacks : IQuickerRpcClientCallbacks
    {
        private readonly HttpResponse _response;
        private readonly CancellationToken _cancellationToken;
        private readonly SemaphoreSlim _writeGate = new(1, 1);

        public ServeTraceStreamCallbacks(HttpResponse response, CancellationToken cancellationToken)
        {
            _response = response;
            _cancellationToken = cancellationToken;
        }

        public int StreamedCount { get; private set; }

        public Task ActionTraceEventAsync(QuickerRpcActionTraceEvent traceEvent)
        {
            return EmitTraceAsync(traceEvent);
        }

        public async Task EmitTraceAsync(QuickerRpcActionTraceEvent traceEvent)
        {
            StreamedCount++;
            await _writeGate.WaitAsync(_cancellationToken).ConfigureAwait(false);
            try
            {
                await WriteEventAsync(_response, "trace", traceEvent, _cancellationToken)
                    .ConfigureAwait(false);
                await WriteEventAsync(
                        _response,
                        "line",
                        new { line = ActionTraceCli.FormatHuman(traceEvent) },
                        _cancellationToken)
                    .ConfigureAwait(false);
            }
            finally
            {
                _writeGate.Release();
            }
        }
    }
}
