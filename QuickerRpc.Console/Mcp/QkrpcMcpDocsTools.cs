using System.ComponentModel;
using ModelContextProtocol.Server;
using QuickerRpc.AgentModel.Guides;

namespace QuickerRpc.Console.Mcp;

[McpServerToolType]
public sealed class QkrpcMcpDocsTools
{
    private static readonly ActionAuthoringGuideService Guides = new();

    [McpServerTool(Name = "docs_index")]
    [Description("List ActionAuthoring guide topics (authoring-workflow, step-runner-get, expressions, …).")]
    public Task<string> DocsIndex()
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

    [McpServerTool(Name = "docs_get")]
    [Description("Read an ActionAuthoring guide topic by id. Start with authoring-workflow for P1–P7.")]
    public Task<string> DocsGet(string topic)
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
            availableTopics = doc.AvailableTopics,
        };
        return Task.FromResult(QkrpcMcpJson.FormatObject(payload));
    }

    [McpServerTool(Name = "docs_search")]
    [Description("Search ActionAuthoring guides by keyword.")]
    public Task<string> DocsSearch(string? query = null, int limit = 10)
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
