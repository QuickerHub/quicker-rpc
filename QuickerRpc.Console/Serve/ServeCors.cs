using Microsoft.AspNetCore.Http;

namespace QuickerRpc.Console.Serve;

/// <summary>Allow browser clients (agent-gui dev) to read SSE trace streams from qkrpc serve.</summary>
internal static class ServeCors
{
    private static readonly string[] AllowedOrigins =
    [
        "http://127.0.0.1:3000",
        "http://localhost:3000",
    ];

    public static bool TryApply(HttpContext context)
    {
        var origin = context.Request.Headers.Origin.ToString();
        if (string.IsNullOrWhiteSpace(origin))
        {
            return false;
        }

        var allowed = false;
        foreach (var candidate in AllowedOrigins)
        {
            if (string.Equals(origin, candidate, StringComparison.OrdinalIgnoreCase))
            {
                allowed = true;
                break;
            }
        }

        if (!allowed)
        {
            return false;
        }

        context.Response.Headers["Access-Control-Allow-Origin"] = origin;
        context.Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
        context.Response.Headers["Access-Control-Allow-Headers"] = "Content-Type, Accept";
        context.Response.Headers.Vary = "Origin";
        return true;
    }

    public static Task HandlePreflightAsync(HttpContext context)
    {
        if (!TryApply(context))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return Task.CompletedTask;
        }

        context.Response.StatusCode = StatusCodes.Status204NoContent;
        return Task.CompletedTask;
    }
}
