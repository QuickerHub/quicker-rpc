using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using QuickerRpc.Contracts.Rpc;

namespace QuickerRpc.Console.Serve;

internal sealed class QkrpcHttpHost : IAsyncDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly string _host;
    private readonly int _port;
    private readonly int _defaultTimeoutSeconds;
    private readonly bool _tryBootstrap;
    private readonly QkrpcRpcSessionPool _pool;
    private WebApplication? _app;

    public QkrpcHttpHost(string host, int port, int defaultTimeoutSeconds, bool tryBootstrap)
    {
        _host = host;
        _port = port;
        _defaultTimeoutSeconds = Math.Max(1, defaultTimeoutSeconds);
        _tryBootstrap = tryBootstrap;
        _pool = new QkrpcRpcSessionPool(defaultTimeoutSeconds, tryBootstrap);
    }

    public async Task RunAsync(CancellationToken cancellationToken = default)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            Args = Array.Empty<string>(),
            ContentRootPath = AppContext.BaseDirectory,
        });

        builder.WebHost.UseUrls($"http://{_host}:{_port}");
        _app = builder.Build();

        _app.MapGet("/health", HandleHealthAsync);
        _app.MapPost("/v1/invoke", HandleInvokeAsync);
        _app.MapMethods("/v1/action/trace/stream", ["GET", "POST", "OPTIONS"], HandleTraceStreamAsync);

        global::System.Console.WriteLine(
            $"qkrpc serve listening on http://{_host}:{_port} (persistent pipe → {QuickerRpcPipeNames.ServerPipe})");
        global::System.Console.WriteLine("POST /v1/invoke  { \"op\": \"action.list\", \"args\": {} }");
        global::System.Console.WriteLine("GET|POST /v1/action/trace/stream  SSE trace lines (id query or JSON body)");
        global::System.Console.WriteLine("GET  /health");

        await using var stopRegistration = cancellationToken.Register(
            static state => _ = ((WebApplication)state!).StopAsync(),
            _app);
        await _app.RunAsync().ConfigureAwait(false);
    }

    private async Task HandleHealthAsync(HttpContext context)
    {
        var cancellationToken = context.RequestAborted;
        ServeHealthResponse payload;
        var statusCode = StatusCodes.Status200OK;
        try
        {
            var rpc = await _pool.GetRpcAsync(cancellationToken).ConfigureAwait(false);
            var token = QuickerRpcClient.CreateRpcCancellationToken(_defaultTimeoutSeconds);
            var pong = await rpc.PingAsync(token).ConfigureAwait(false);
            var version = await rpc.GetProtocolVersionAsync(token).ConfigureAwait(false);
            payload = new ServeHealthResponse
            {
                Ok = true,
                Pong = pong,
                ProtocolVersion = version,
                Pipe = QuickerRpcPipeNames.ServerPipe,
            };
        }
        catch (QuickerRpcClientException)
        {
            await _pool.InvalidateAsync().ConfigureAwait(false);
            statusCode = StatusCodes.Status503ServiceUnavailable;
            payload = new ServeHealthResponse { Ok = false, Pipe = QuickerRpcPipeNames.ServerPipe };
        }

        context.Response.StatusCode = statusCode;
        await context.Response
            .WriteAsJsonAsync(payload, JsonOptions, cancellationToken)
            .ConfigureAwait(false);
    }

    private async Task HandleInvokeAsync(HttpContext context)
    {
        var cancellationToken = context.RequestAborted;
        ServeInvokeRequest? body;
        try
        {
            body = await context.Request
                .ReadFromJsonAsync<ServeInvokeRequest>(JsonOptions, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (JsonException ex)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response
                .WriteAsJsonAsync(
                    new ServeInvokeResponse { Ok = false, Error = "INVALID_JSON", Message = ex.Message },
                    JsonOptions,
                    cancellationToken)
                .ConfigureAwait(false);
            return;
        }

        if (body is null || string.IsNullOrWhiteSpace(body.Op))
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            await context.Response
                .WriteAsJsonAsync(
                    new ServeInvokeResponse { Ok = false, Error = "INVALID_BODY", Message = "Body must include op." },
                    JsonOptions,
                    cancellationToken)
                .ConfigureAwait(false);
            return;
        }

        var timeout = body.TimeoutSeconds > 0 ? body.TimeoutSeconds : _defaultTimeoutSeconds;
        var result = await ServeInvokeDispatcher
            .InvokeAsync(_pool, body.Op, body.Args, timeout, cancellationToken)
            .ConfigureAwait(false);

        context.Response.StatusCode = result.Ok
            ? StatusCodes.Status200OK
            : StatusCodes.Status502BadGateway;
        await context.Response
            .WriteAsJsonAsync(result, JsonOptions, cancellationToken)
            .ConfigureAwait(false);
    }

    private async Task HandleTraceStreamAsync(HttpContext context)
    {
        if (HttpMethods.IsOptions(context.Request.Method))
        {
            await ServeCors.HandlePreflightAsync(context).ConfigureAwait(false);
            return;
        }

        ServeCors.TryApply(context);

        if (HttpMethods.IsGet(context.Request.Method))
        {
            var query = ServeActionTraceStream.ParseQuery(context);
            if (query is null)
            {
                context.Response.StatusCode = StatusCodes.Status400BadRequest;
                await context.Response
                    .WriteAsJsonAsync(new { ok = false, error = "MISSING_ACTION_ID" }, JsonOptions, context.RequestAborted)
                    .ConfigureAwait(false);
                return;
            }

            await ServeActionTraceStream
                .HandleAsync(context, _defaultTimeoutSeconds, _tryBootstrap, context.RequestAborted, query)
                .ConfigureAwait(false);
            return;
        }

        await ServeActionTraceStream
            .HandleAsync(context, _defaultTimeoutSeconds, _tryBootstrap, context.RequestAborted)
            .ConfigureAwait(false);
    }

    public async ValueTask DisposeAsync()
    {
        if (_app is not null)
        {
            await _app.DisposeAsync().ConfigureAwait(false);
        }

        await _pool.DisposeAsync().ConfigureAwait(false);
    }
}
