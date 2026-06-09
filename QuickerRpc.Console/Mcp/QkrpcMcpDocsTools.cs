using System.ComponentModel;
using ModelContextProtocol.Server;
using QuickerRpc.AgentModel.Guides;

namespace QuickerRpc.Console.Mcp;

[McpServerToolType]
public sealed class QkrpcMcpDocsTools
{
    private static readonly ActionAuthoringGuideService Guides = new();

    [McpServerTool(Name = "docs")]
    [Description(
        "ActionAuthoring guides. action=index|search|get. "
        + "Start with authoring-workflow (P1–P7); disk layout: workspace-editing. "
        + "MCP resources: quicker://workspace/readme, quicker://workspace/index.")]
    public Task<string> Docs(
        string action,
        string? topic = null,
        string? reference = null,
        string? query = null,
        int? limit = null)
    {
        var verb = (action ?? string.Empty).Trim().ToLowerInvariant();
        return verb switch
        {
            "index" => DocsIndex(),
            "search" => DocsSearch(query, limit ?? 10),
            "get" => DocsGet(topic ?? string.Empty),
            _ => Task.FromResult(QkrpcMcpJson.FormatObject(new
            {
                ok = false,
                errorMessage = "action must be index | search | get",
            })),
        };
    }

    private Task<string> DocsIndex()
    {
        var search = Guides.Search(null, 200);
        var payload = new
        {
            ok = true,
            action = "docs-index",
            topics = search.Items.Select(i => new { topic = i.Topic, title = i.Title }).ToList(),
            availableTopics = search.AvailableTopics,
        };
        return Task.FromResult(QkrpcMcpJson.FormatObject(payload));
    }

    private Task<string> DocsGet(string topic)
    {
        var doc = Guides.GetDoc(topic);
        var payload = new
        {
            ok = doc.Success,
            action = "docs-get",
            success = doc.Success,
            errorMessage = doc.ErrorMessage,
            topic = doc.Topic,
            title = doc.Title,
            markdown = doc.Markdown,
            schema = doc.Schema,
            availableTopics = doc.AvailableTopics,
        };
        return Task.FromResult(QkrpcMcpJson.FormatObject(payload));
    }

    private Task<string> DocsSearch(string? query = null, int limit = 10)
    {
        var search = Guides.Search(query, limit);
        var payload = new
        {
            ok = search.Success,
            action = "docs-search",
            success = search.Success,
            keyword = search.Keyword,
            matchCount = search.MatchCount,
            items = search.Items,
            availableTopics = search.AvailableTopics,
        };
        return Task.FromResult(QkrpcMcpJson.FormatObject(payload));
    }
}
