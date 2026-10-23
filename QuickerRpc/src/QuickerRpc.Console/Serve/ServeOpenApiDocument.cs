using System.Text.Json;
using System.Text.Json.Nodes;

namespace QuickerRpc.Console.Serve;

internal static class ServeOpenApiDocument
{
    private static readonly JsonSerializerOptions WriteOptions = new() { WriteIndented = true };

    internal static string BuildJson(string baseUrl)
    {
        var doc = BuildRoot(baseUrl.TrimEnd('/'));
        return doc.ToJsonString(WriteOptions);
    }

    private static JsonObject BuildRoot(string baseUrl)
    {
        return new JsonObject
        {
            ["openapi"] = "3.1.0",
            ["info"] = new JsonObject
            {
                ["title"] = "qkrpc serve",
                ["description"] = "Local HTTP bridge to QuickerRpc plugin. Prefer MCP (qkrpc mcp) for AI agents; use serve for HTTP clients.",
                ["version"] = ResolveCliVersion(),
            },
            ["servers"] = new JsonArray(new JsonObject { ["url"] = baseUrl }),
            ["paths"] = BuildPaths(),
            ["components"] = BuildComponents(),
            ["x-qkrpc-invoke-ops"] = new JsonArray(InvokeOpsArray()),
        };
    }

    private static JsonArray InvokeOpsArray()
    {
        var ops = new JsonArray();
        foreach (var op in ServeOpenApiCatalog.InvokeOps)
        {
            ops.Add(op);
        }

        return ops;
    }

    private static JsonObject BuildPaths()
    {
        return new JsonObject
        {
            ["/health"] = new JsonObject
            {
                ["get"] = new JsonObject
                {
                    ["operationId"] = "health",
                    ["summary"] = "Plugin connectivity",
                    ["responses"] = new JsonObject
                    {
                        ["200"] = ResponseRef("ServeHealthResponse"),
                        ["503"] = ResponseRef("ServeHealthResponse"),
                    },
                },
            },
            ["/v1/invoke"] = new JsonObject
            {
                ["post"] = new JsonObject
                {
                    ["operationId"] = "invoke",
                    ["summary"] = "Dispatch op to QuickerRpc",
                    ["requestBody"] = new JsonObject
                    {
                        ["required"] = true,
                        ["content"] = new JsonObject
                        {
                            ["application/json"] = new JsonObject
                            {
                                ["schema"] = SchemaRef("ServeInvokeRequest"),
                            },
                        },
                    },
                    ["responses"] = new JsonObject
                    {
                        ["200"] = ResponseRef("ServeInvokeResponse"),
                        ["400"] = ResponseRef("ServeInvokeResponse"),
                        ["502"] = ResponseRef("ServeInvokeResponse"),
                    },
                },
            },
            ["/v1/action/trace/stream"] = new JsonObject
            {
                ["get"] = new JsonObject
                {
                    ["operationId"] = "actionTraceStreamGet",
                    ["summary"] = "SSE action trace (query id)",
                    ["responses"] = new JsonObject { ["200"] = SseResponse() },
                },
                ["post"] = new JsonObject
                {
                    ["operationId"] = "actionTraceStreamPost",
                    ["summary"] = "SSE action trace (JSON body)",
                    ["responses"] = new JsonObject { ["200"] = SseResponse() },
                },
            },
            ["/openapi.json"] = new JsonObject
            {
                ["get"] = new JsonObject
                {
                    ["operationId"] = "openApi",
                    ["summary"] = "This OpenAPI document",
                    ["responses"] = new JsonObject
                    {
                        ["200"] = new JsonObject
                        {
                            ["description"] = "OpenAPI 3.1 JSON",
                            ["content"] = new JsonObject
                            {
                                ["application/json"] = new JsonObject { ["schema"] = new JsonObject { ["type"] = "object" } },
                            },
                        },
                    },
                },
            },
        };
    }

    private static JsonObject BuildComponents()
    {
        return new JsonObject
        {
            ["schemas"] = new JsonObject
            {
                ["HostBinding"] = new JsonObject
                {
                    ["type"] = "object",
                    ["required"] = new JsonArray("hostInstanceId", "hostSessionId", "endpoint", "protocolVersion", "schemaVersion", "hostKind", "quickerVersion", "capabilities"),
                    ["properties"] = new JsonObject
                    {
                        ["hostInstanceId"] = new JsonObject { ["type"] = "string" },
                        ["hostSessionId"] = new JsonObject { ["type"] = "string" },
                        ["endpoint"] = new JsonObject { ["type"] = "string" },
                        ["protocolVersion"] = new JsonObject { ["type"] = "integer" },
                        ["schemaVersion"] = new JsonObject { ["type"] = "integer" },
                        ["hostKind"] = new JsonObject { ["enum"] = new JsonArray("v1", "v2") },
                        ["quickerVersion"] = new JsonObject { ["type"] = "string" },
                        ["capabilities"] = new JsonObject { ["type"] = "object", ["additionalProperties"] = new JsonObject { ["type"] = "boolean" } },
                    },
                },
                ["ServeHealthResponse"] = new JsonObject
                {
                    ["type"] = "object",
                    ["properties"] = new JsonObject
                    {
                        ["ok"] = new JsonObject { ["type"] = "boolean" },
                        ["service"] = new JsonObject { ["type"] = "string", ["const"] = "qkrpc" },
                        ["hostBinding"] = SchemaRef("HostBinding"),
                        ["pong"] = new JsonObject { ["type"] = "string" },
                        ["protocolVersion"] = new JsonObject { ["type"] = "integer" },
                        ["pipe"] = new JsonObject { ["type"] = "string" },
                    },
                },
                ["ServeInvokeRequest"] = new JsonObject
                {
                    ["type"] = "object",
                    ["required"] = new JsonArray("op"),
                    ["properties"] = new JsonObject
                    {
                        ["op"] = new JsonObject
                        {
                            ["type"] = "string",
                            ["description"] = "Serve op name, e.g. action.list, guide.get",
                            ["examples"] = new JsonArray("action.list", "step-runner.get"),
                        },
                        ["args"] = new JsonObject
                        {
                            ["type"] = "object",
                            ["additionalProperties"] = true,
                        },
                        ["hostBinding"] = SchemaRef("HostBinding"),
                        ["timeoutSeconds"] = new JsonObject { ["type"] = "integer", ["minimum"] = 1 },
                    },
                },
                ["ServeInvokeResponse"] = new JsonObject
                {
                    ["type"] = "object",
                    ["properties"] = new JsonObject
                    {
                        ["ok"] = new JsonObject { ["type"] = "boolean" },
                        ["data"] = new JsonObject { ["description"] = "Op-specific payload" },
                        ["hostBinding"] = SchemaRef("HostBinding"),
                        ["error"] = new JsonObject { ["type"] = "string" },
                        ["message"] = new JsonObject { ["type"] = "string" },
                    },
                },
            },
        };
    }

    private static JsonObject ResponseRef(string schemaName) => new()
    {
        ["description"] = "OK",
        ["content"] = new JsonObject
        {
            ["application/json"] = new JsonObject
            {
                ["schema"] = SchemaRef(schemaName),
            },
        },
    };

    private static JsonObject SchemaRef(string name) => new JsonObject
    {
        ["$ref"] = $"#/components/schemas/{name}",
    };

    private static JsonObject SseResponse() => new()
    {
        ["description"] = "text/event-stream trace lines",
        ["content"] = new JsonObject
        {
            ["text/event-stream"] = new JsonObject { ["schema"] = new JsonObject { ["type"] = "string" } },
        },
    };

    private static string ResolveCliVersion()
    {
        var version = typeof(ServeOpenApiDocument).Assembly.GetName().Version;
        if (version is null)
        {
            return "0.0.0";
        }

        return version.Revision > 0
            ? $"{version.Major}.{version.Minor}.{version.Build}.{version.Revision}"
            : $"{version.Major}.{version.Minor}.{version.Build}";
    }
}
